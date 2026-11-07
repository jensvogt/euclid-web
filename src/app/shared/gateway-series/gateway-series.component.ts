import {Component, Input, OnDestroy, OnInit, inject} from '@angular/core';
import {MatCard, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {LineChart} from 'echarts/charts';
import {GridComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {interval, Subscription} from 'rxjs';

import {timeConversion} from '../date-utils.component';
import {autoReloadPeriod} from '../list/euclid-list.component';
import {
    GATEWAY_COUNT_METRIC,
    GATEWAY_TIME_METRIC,
    MetricPoint,
    MetricsService,
    RAW_PERIOD_MINUTES,
} from '../metrics/metrics.service';

// Only what this card draws, so the bundle carries a line chart rather than all of echarts.
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** How many stored buckets to draw. At five minutes each, the last four hours. */
const BUCKETS = 48;

const COLOUR = {time: '#004a9f', count: '#c8781e'};

/** Which of the gateway's two figures a card is showing. They are recorded by one timer, around every request. */
export type GatewaySeries = 'time' | 'count';

/**
 * One of the two things the gateway records about every request it routes.
 *
 * `time` is how long it took to answer, in milliseconds, and `count` is how many it answered - the pair
 * `MonitoringTimer` writes around every request in the gateway's own router, which makes them the whole
 * installation's figures rather than one module's. Side by side they are the question and the answer:
 * what it was asked to do, and how well it kept up.
 *
 * One component for both because the chart is the same chart; what differs is the unit, the colour and
 * how a figure is read aloud. The two fold differently at the server, though, and that is not cosmetic:
 * a rate sums over its method labels while a gauge takes their mean weighted by how often each method
 * was called - which is the time a caller actually saw, rather than the average of the methods.
 */
@Component({
    selector: 'gateway-series',
    templateUrl: './gateway-series.component.html',
    styleUrls: ['./gateway-series.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, NgxEchartsDirective],
    providers: [provideEchartsCore({echarts})],
})
export class GatewaySeriesComponent implements OnInit, OnDestroy {

    @Input({required: true}) series!: GatewaySeries;

    options: Record<string, unknown> = {};
    summary = '';
    note = '';

    private readonly metricsService = inject(MetricsService);
    private updateSubscription: Subscription | undefined;

    get title(): string {
        return this.series === 'time' ? 'Gateway response time' : 'Gateway requests';
    }

    ngOnInit(): void {
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    private load(): void {
        const metric = this.series === 'time' ? GATEWAY_TIME_METRIC : GATEWAY_COUNT_METRIC;
        this.metricsService.history(metric, BUCKETS).subscribe({
            next: (points: MetricPoint[]) => {
                this.note = '';
                if (points.length === 0) {
                    this.summary = 'Nothing recorded yet. The gateway is timed and counted around every request it routes.';
                    this.options = {};
                    return;
                }
                this.summary = summaryOf(this.series, points);
                this.options = chartOf(this.series, points);
            },
            error: (error: Error) => {
                this.note = error.message;
                this.options = {};
            },
        });
    }
}

/** Where it stands and where it has been, in the words the figure is read in. */
function summaryOf(series: GatewaySeries, points: MetricPoint[]): string {
    const latest = points[points.length - 1].value;
    const worst = Math.max(...points.map(point => point.value));
    const cadence = ` — one point per ${RAW_PERIOD_MINUTES} minutes`;
    return series === 'time'
        ? `${latest.toFixed(1)} ms last reading, ${worst.toFixed(1)} ms at its worst${cadence}`
        : `${Math.round(latest)} requests in the last bucket, ${Math.round(worst)} at the busiest${cadence}`;
}

/**
 * The line.
 *
 * A quiet stretch has no bucket at all, so the axis skips it - which is why the labels are worth
 * reading rather than counting. The y axis starts at zero: a response time read against an axis that
 * starts where the data happens to start makes every installation look like it is struggling, and a
 * request count read that way makes a quiet hour look like an outage.
 */
function chartOf(series: GatewaySeries, points: MetricPoint[]): Record<string, unknown> {
    const time = series === 'time';
    return {
        tooltip: {
            trigger: 'axis',
            valueFormatter: (value: number) => time ? `${value?.toFixed(1)} ms` : `${Math.round(value ?? 0)}`,
        },
        // The same padding on every dashboard chart, so their plots are the same size and not merely
        // their boxes. `containLabel` makes these the room around the labels rather than around the axes.
        grid: {left: 8, right: 16, top: 8, bottom: 4, containLabel: true},
        xAxis: {
            type: 'category',
            data: points.map(point => timeConversion(point.timestamp)),
            axisLabel: {fontSize: 10},
        },
        yAxis: {
            type: 'value',
            min: 0,
            minInterval: time ? undefined : 1,
            name: time ? 'ms' : 'requests',
            nameTextStyle: {fontSize: 10},
            axisLabel: {fontSize: 10},
        },
        series: [{
            name: time ? 'Response time' : 'Requests',
            type: 'line',
            showSymbol: false,
            smooth: true,
            areaStyle: {opacity: 0.1},
            itemStyle: {color: time ? COLOUR.time : COLOUR.count},
            data: points.map(point => point.value),
        }],
    };
}
