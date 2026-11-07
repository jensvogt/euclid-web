import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {MatCard, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {BarChart} from 'echarts/charts';
import {GridComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {interval, Subscription} from 'rxjs';

import {autoReloadPeriod} from '../list/euclid-list.component';
import {GATEWAY_COUNT_METRIC, MetricPoint, MetricsService} from '../metrics/metrics.service';

// Only what this card draws, so the bundle carries a bar chart rather than all of echarts.
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** How many days the chart shows, and how many daily buckets it asks for to fill them. */
const DAYS = 7;

/** A day of the week as the axis labels it, in the order `Date.getUTCDay()` numbers them. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COLOUR = '#c4cbd6';
const TODAY_COLOUR = '#004a9f';

/**
 * How much the installation has been asked to do, a day at a time for the last week.
 *
 * `gateway-service-count` is recorded once per request in the gateway's own router, labelled by HTTP
 * method - the closest thing the monitoring module keeps to traffic across every module at once. The
 * labels fold into one figure per day, a rate summing over them, which is the request count this
 * chart wants.
 *
 * The bars are calendar days rather than whatever buckets came back: a day with no traffic has no
 * bucket at all, and without a slot of its own its neighbours would slide over and be labelled as days
 * they are not. Days are keyed in UTC because the daily buckets are - keying them locally would file a
 * bucket under the neighbouring bar for anybody not on UTC.
 */
@Component({
    selector: 'weekly-traffic',
    templateUrl: './weekly-traffic.component.html',
    styleUrls: ['./weekly-traffic.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, NgxEchartsDirective],
    providers: [provideEchartsCore({echarts})],
})
export class WeeklyTrafficComponent implements OnInit, OnDestroy {

    options: Record<string, unknown> = {};

    /** The line under the heading: what the week came to, or why there is nothing to show. */
    summary = '';
    note = '';

    private readonly metricsService = inject(MetricsService);
    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    private load(): void {
        this.metricsService.history(GATEWAY_COUNT_METRIC, DAYS, undefined, 'DAY').subscribe({
            next: (points: MetricPoint[]) => {
                this.note = '';
                const bars = barsOf(points);
                const total = bars.reduce((sum, bar) => sum + bar.value, 0);
                this.summary = total > 0
                    ? `${Math.round(total)} gateway requests in the last ${DAYS} days`
                    : `No gateway requests recorded in the last ${DAYS} days.`;
                this.options = chartOf(bars);
            },
            error: (error: Error) => {
                this.note = error.message;
                this.options = {};
            },
        });
    }
}

/** One bar: a day, what it carried, and whether it is the day still being filled in. */
interface TrafficBar {
    label: string;
    value: number;
    today: boolean;
}

/** The last seven days, oldest first, with the buckets that came back filed into them. */
function barsOf(points: MetricPoint[]): TrafficBar[] {
    const byDay = new Map<string, number>();
    for (const point of points) {
        const stamp = new Date(point.timestamp);
        if (Number.isNaN(stamp.getTime())) {
            continue;
        }
        const key = stamp.toISOString().substring(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + point.value);
    }

    const bars: TrafficBar[] = [];
    const now = Date.now();
    for (let back = DAYS - 1; back >= 0; back--) {
        const day = new Date(now - back * 86_400_000);
        bars.push({
            label: DAY_NAMES[day.getUTCDay()],
            value: byDay.get(day.toISOString().substring(0, 10)) ?? 0,
            today: back === 0,
        });
    }
    return bars;
}

/**
 * The bars.
 *
 * Today is picked out because it is the one still being filled in: a short last bar is the day so far
 * rather than a day that went quiet, and nothing else on the chart would say so.
 */
function chartOf(bars: TrafficBar[]): Record<string, unknown> {
    return {
        tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}},
        // The same padding on every dashboard chart, so their plots are the same size and not merely
        // their boxes. `containLabel` makes these the room around the labels rather than around the axes.
        grid: {left: 8, right: 16, top: 8, bottom: 4, containLabel: true},
        xAxis: {
            type: 'category',
            data: bars.map(bar => bar.label),
            axisTick: {show: false},
            axisLabel: {fontSize: 11},
        },
        yAxis: {type: 'value', minInterval: 1, axisLabel: {fontSize: 10}, splitLine: {show: true}},
        series: [{
            name: 'Requests',
            type: 'bar',
            barMaxWidth: 36,
            itemStyle: {borderRadius: [4, 4, 0, 0]},
            data: bars.map(bar => ({
                value: bar.value,
                itemStyle: {color: bar.today ? TODAY_COLOUR : COLOUR},
            })),
        }],
    };
}
