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
    MetricPoint,
    MetricsService,
    MODULE_LABEL,
    PROCESS_CPU_METRIC,
    PROCESS_MEMORY_PERCENT_METRIC,
    RAW_PERIOD_MINUTES,
} from '../metrics/metrics.service';

// Only what this card draws, so the bundle carries a line chart rather than all of echarts.
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** How many stored buckets to draw. At five minutes each, the last four hours. */
const BUCKETS = 48;

/**
 * What the manager process is labelled with.
 *
 * `gateway`, which is the name its own MetricsPusher has always used for the service time and count
 * it records - so its CPU and memory sit beside them under the same label rather than under a second
 * name for the same process.
 */
const MANAGER = 'gateway';

const COLOUR = {cpu: '#004a9f', memory: '#c8781e'};

/** Which of the manager's two figures a card is showing. */
export type ManagerUsage = 'cpu' | 'memory';

/**
 * What the manager process costs the machine it runs on.
 *
 * euclid-mgr is the one process no module page covers: it serves the gateway every request goes
 * through, and it is not a module, so nothing sampled it until the manager was given the same
 * `RecordProcessUsage` sampler every module has. The figures are its own share of the machine, on the
 * same scale as the host gauges above - 100 is the whole machine rather than one core.
 *
 * Its share, not the host's: a busy machine with an idle manager reads low here and high in the system
 * load gauges, and the pair is what tells "euclid is working hard" from "this box is".
 */
@Component({
    selector: 'manager-usage',
    templateUrl: './manager-usage.component.html',
    styleUrls: ['./manager-usage.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, NgxEchartsDirective],
    providers: [provideEchartsCore({echarts})],
})
export class ManagerUsageComponent implements OnInit, OnDestroy {

    @Input({required: true}) usage!: ManagerUsage;

    options: Record<string, unknown> = {};
    summary = '';
    note = '';

    private readonly metricsService = inject(MetricsService);
    private updateSubscription: Subscription | undefined;

    get title(): string {
        return this.usage === 'cpu' ? 'Manager CPU' : 'Manager memory';
    }

    ngOnInit(): void {
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    private load(): void {
        const metric = this.usage === 'cpu' ? PROCESS_CPU_METRIC : PROCESS_MEMORY_PERCENT_METRIC;
        this.metricsService.history(metric, BUCKETS, {name: MODULE_LABEL, value: MANAGER}).subscribe({
            next: (points: MetricPoint[]) => {
                this.note = '';
                if (points.length === 0) {
                    this.summary = 'Nothing recorded yet. The manager samples what it costs once a minute.';
                    this.options = {};
                    return;
                }
                const latest = points[points.length - 1].value;
                const worst = Math.max(...points.map(point => point.value));
                this.summary = `${latest.toFixed(1)}% last reading, ${worst.toFixed(1)}% at its highest`
                    + ` — one point per ${RAW_PERIOD_MINUTES} minutes`;
                this.options = chartOf(this.usage, points);
            },
            error: (error: Error) => {
                this.note = error.message;
                this.options = {};
            },
        });
    }
}

/**
 * The line.
 *
 * The axis is fitted to the readings rather than fixed at a hundred: the manager uses a few per cent
 * of a machine, and against the whole of one its line is flat on the floor and says nothing about
 * what it has been doing. Where it stands against the machine is the gauges' question, and the
 * summary above gives the figure in full.
 *
 * It still starts at zero, so the shape stays proportional: an axis fitted at both ends turns a
 * reading that moved from 1.9 to 2.1 per cent into a chart that looks like a doubling.
 */
function chartOf(usage: ManagerUsage, points: MetricPoint[]): Record<string, unknown> {
    return {
        tooltip: {trigger: 'axis', valueFormatter: (value: number) => `${value?.toFixed(1)} %`},
        grid: {left: 8, right: 16, top: 8, bottom: 4, containLabel: true},
        xAxis: {
            type: 'category',
            data: points.map(point => timeConversion(point.timestamp)),
            axisLabel: {fontSize: 10},
        },
        yAxis: {
            type: 'value',
            min: 0,
            name: '%',
            nameTextStyle: {fontSize: 10},
            axisLabel: {fontSize: 10},
        },
        series: [{
            name: usage === 'cpu' ? 'CPU' : 'Memory',
            type: 'line',
            showSymbol: false,
            smooth: true,
            areaStyle: {opacity: 0.1},
            itemStyle: {color: usage === 'cpu' ? COLOUR.cpu : COLOUR.memory},
            data: points.map(point => point.value),
        }],
    };
}
