import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatTableModule} from '@angular/material/table';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {BarChart, LineChart} from 'echarts/charts';
import {GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {forkJoin, interval, Subscription} from 'rxjs';

import {dateConversion} from '../date-utils.component';
import {FooterComponent} from '../footer/footer.component';
import {autoReloadPeriod} from '../list/euclid-list.component';
import {EuclidModule, moduleOf, parentRouteOf} from './euclid-modules';
import {
    MetricPoint,
    MetricsService,
    MODULE_LABEL,
    PROCESS_CPU_METRIC,
    PROCESS_MEMORY_REAL_METRIC,
    PROCESS_MEMORY_VIRTUAL_METRIC,
    ModuleReadings,
    RAW_PERIOD_MINUTES,
    StoredSample,
    StoredSeries,
    serviceCountMetric,
    serviceTimeMetric,
} from './metrics.service';

// Only the pieces of echarts this page draws with, so the bundle carries a bar chart and a line chart
// rather than all of echarts.
echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

/** How many stored buckets the response chart asks for. At five minutes each, the last four hours. */
const RESPONSE_BUCKETS = 48;

/**
 * One module's metrics: what it last recorded, and how that has moved.
 *
 * All of it comes from the monitoring module rather than from the module being looked at, and that is
 * the whole design of this page - see MetricsService. Asking a module for its own metrics empties the
 * collector it reads, which it is already being emptied of every ten seconds by its own push, so the
 * answer on a quiet installation is nothing at all: the page used to show an empty table and a chart
 * that started again on every reload. What was pushed is kept, so the newest stored bucket is the most
 * recent complete reading there is, and the buckets behind it are a history that does not depend on
 * anybody having watched it happen.
 *
 * What a reading costs is a few minutes of lag - a bucket closes every five - and an administrator's
 * rights, since stored metrics are not a module's own to hand out.
 */
@Component({
    selector: 'module-metrics-component',
    templateUrl: './module-metrics.component.html',
    styleUrls: ['./module-metrics.component.scss'],
    standalone: true,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardContent,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatTableModule,
        MatExpansionModule,
        NgxEchartsDirective,
        RouterLink,
        FooterComponent,
    ],
    providers: [provideEchartsCore({echarts})],
})
export class ModuleMetricsComponent implements OnInit, OnDestroy {

    lastUpdate: Date = new Date();
    target = '';
    module: EuclidModule | undefined;

    samples: StoredSample[] = [];
    columns = ['name', 'type', 'value', 'samples'];

    /** When the newest stored bucket closed, which is what every figure on this page is as of. */
    asOf = '';

    gaugeOptions: Record<string, unknown> = {};
    historyOptions: Record<string, unknown> = {};
    responseOptions: Record<string, unknown> = {};
    cpuOptions: Record<string, unknown> = {};
    memoryOptions: Record<string, unknown> = {};

    /** Whether the process has reported anything about itself yet, which decides whether to draw it. */
    sampled = false;

    /** Whether the response chart has anything to draw, and what to say instead when it has not. */
    served = false;
    responseNote = '';

    /** Said in place of the whole page when the monitoring module cannot be read at all. */
    note = '';

    protected readonly dateConversion = dateConversion;

    private timeMetric = '';
    private countMetric = '';
    private updateSubscription: Subscription | undefined;

    constructor(
        private readonly route: ActivatedRoute,
        private readonly metricsService: MetricsService,
        private readonly router: Router,
    ) {
    }

    ngOnInit(): void {
        this.target = this.route.snapshot.paramMap.get('target') ?? '';
        this.module = moduleOf(this.target);
        this.timeMetric = serviceTimeMetric(this.target);
        this.countMetric = serviceCountMetric(this.target);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    /** Up a level rather than back through history, as every other page's does - see parentRouteOf(). */
    back(): void {
        void this.router.navigateByUrl(parentRouteOf(this.router.url));
    }

    refresh(): void {
        this.load();
    }

    /**
     * One read of the module's stored metrics, and one of each service series.
     *
     * Together, because they fail together: all three are the same module answering the same action, so
     * one refusal - `list` wants an administrator - is one message rather than three. It is said in place
     * of the charts rather than in the snackbar, which on a page that reloads itself would otherwise be
     * a refusal every minute for as long as the page is open.
     */
    load(): void {
        if (!this.target) {
            return;
        }
        // The module is a label on these three rather than part of their name - every module process
        // records them under the same metric - so they are asked for by label. See PROCESS_CPU_METRIC.
        const ofThisModule = {name: MODULE_LABEL, value: this.target};

        forkJoin({
            readings: this.metricsService.readings(this.target),
            times: this.metricsService.history(this.timeMetric, RESPONSE_BUCKETS),
            calls: this.metricsService.history(this.countMetric, RESPONSE_BUCKETS),
            cpu: this.metricsService.history(PROCESS_CPU_METRIC, RESPONSE_BUCKETS, ofThisModule),
            real: this.metricsService.history(PROCESS_MEMORY_REAL_METRIC, RESPONSE_BUCKETS, ofThisModule),
            virtual: this.metricsService.history(PROCESS_MEMORY_VIRTUAL_METRIC, RESPONSE_BUCKETS, ofThisModule),
        }).subscribe({
            next: ({readings, times, calls, cpu, real, virtual}: {
                readings: ModuleReadings;
                times: MetricPoint[];
                calls: MetricPoint[];
                cpu: MetricPoint[];
                real: MetricPoint[];
                virtual: MetricPoint[];
            }) => {
                this.lastUpdate = new Date();
                this.note = '';
                this.samples = readings.latest;
                this.asOf = readings.asOf;
                this.gaugeOptions = this.buildGaugeChart(readings.latest);
                this.historyOptions = this.buildHistoryChart(readings.series);

                this.served = times.length > 0 || calls.length > 0;
                this.responseOptions = this.served ? this.buildResponseChart(times, calls) : {};
                this.sampled = cpu.length > 0 || real.length > 0 || virtual.length > 0;
                this.cpuOptions = this.buildCpuChart(cpu);
                this.memoryOptions = this.buildMemoryChart(real, virtual);

                this.responseNote = this.served
                    ? ''
                    : `Nothing recorded for ${this.timeMetric} yet. Readings are averaged into`
                    + ` ${RAW_PERIOD_MINUTES}-minute buckets, so the first point appears a few minutes`
                    + ` after the module serves a call.`;
            },
            error: (error: Error) => {
                this.note = error.message;
                this.samples = [];
                this.asOf = '';
                this.served = false;
                this.sampled = false;
            },
        });
    }

    private buildGaugeChart(samples: StoredSample[]): Record<string, unknown> {
        return {
            title: {text: 'Last reading', left: 'center', textStyle: {fontSize: 14}},
            tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}},
            grid: {left: '3%', right: '4%', bottom: '3%', top: 50, containLabel: true},
            xAxis: {type: 'value'},
            yAxis: {type: 'category', data: samples.map(sample => sample.display), axisLabel: {fontSize: 10}},
            series: [{
                type: 'bar',
                data: samples.map(sample => sample.value),
                itemStyle: {color: '#004a9f'},
            }],
        };
    }

    /**
     * How long the module took to answer, and how often it was asked, on two axes.
     *
     * Two axes because milliseconds and calls share nothing but the clock. The buckets of the two
     * metrics are written by the same push and so line up, but the chart does not assume it: the x axis
     * is every bucket either of them has, and a series without one leaves a gap there rather than a
     * zero. A quiet stretch has no bucket at all, so the axis skips it - which is why the labels are
     * worth reading rather than counting.
     */
    private buildResponseChart(times: MetricPoint[], calls: MetricPoint[]): Record<string, unknown> {
        const timeOf = new Map(times.map(point => [point.timestamp, point.value]));
        const callOf = new Map(calls.map(point => [point.timestamp, point.value]));
        const buckets = [...new Set([...timeOf.keys(), ...callOf.keys()])].sort();

        return {
            title: {
                text: 'Response time and calls',
                subtext: `One point per ${RAW_PERIOD_MINUTES} minutes, as the monitoring module stored it`,
                left: 'center',
                textStyle: {fontSize: 14},
                subtextStyle: {fontSize: 10},
            },
            tooltip: {trigger: 'axis'},
            legend: {bottom: 0, textStyle: {fontSize: 10}},
            grid: {left: '3%', right: '4%', bottom: 30, top: 60, containLabel: true},
            xAxis: {
                type: 'category',
                data: buckets.map(bucket => new Date(bucket).toLocaleTimeString()),
                axisLabel: {fontSize: 10},
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'ms',
                    nameTextStyle: {fontSize: 10},
                    axisLabel: {fontSize: 10},
                },
                {
                    type: 'value',
                    name: 'calls',
                    nameTextStyle: {fontSize: 10},
                    axisLabel: {fontSize: 10},
                    minInterval: 1,
                    splitLine: {show: false},
                },
            ],
            series: [
                {
                    name: 'Response time (ms)',
                    type: 'line',
                    yAxisIndex: 0,
                    showSymbol: false,
                    smooth: true,
                    data: buckets.map(bucket => timeOf.get(bucket) ?? null),
                    itemStyle: {color: '#004a9f'},
                },
                {
                    name: 'Calls',
                    type: 'line',
                    yAxisIndex: 1,
                    showSymbol: false,
                    areaStyle: {opacity: 0.1},
                    data: buckets.map(bucket => callOf.get(bucket) ?? null),
                    itemStyle: {color: '#c8781e'},
                },
            ],
        };
    }

    /**
     * What the process is costing the machine it runs on: its share of the CPU, over time.
     *
     * A different question from the two charts above it, which are about what the module is being asked
     * to do - and the pair is what makes either one worth reading. Service time climbing on its own is a
     * module working harder; service time climbing beside this is a module that has run out of room.
     *
     * The figure is the process's own usage as `HttpActionServer` samples it once a minute, not the
     * host's: a busy machine with an idle module reads low here and high in EMO's system-cpu-usage.
     */
    private buildCpuChart(cpu: MetricPoint[]): Record<string, unknown> {
        return {
            title: {
                text: 'CPU',
                subtext: `What the ${this.target.toUpperCase()} process itself used, per cent`,
                left: 'center',
                textStyle: {fontSize: 14},
                subtextStyle: {fontSize: 10},
            },
            tooltip: {trigger: 'axis', valueFormatter: (value: number) => `${value?.toFixed(1)} %`},
            grid: {left: '3%', right: '4%', bottom: '3%', top: 60, containLabel: true},
            xAxis: {
                type: 'category',
                data: cpu.map(point => new Date(point.timestamp).toLocaleTimeString()),
                axisLabel: {fontSize: 10},
            },
            // Fixed to a hundred: a process idling at two per cent should look idle rather than fill the
            // chart with the shape of its own rounding, which an axis fitted to the data would do.
            yAxis: {type: 'value', min: 0, max: 100, name: '%', nameTextStyle: {fontSize: 10}, axisLabel: {fontSize: 10}},
            series: [{
                name: 'CPU',
                type: 'line',
                showSymbol: false,
                smooth: true,
                areaStyle: {opacity: 0.1},
                data: cpu.map(point => point.value),
                itemStyle: {color: '#004a9f'},
            }],
        };
    }

    /**
     * What the process is holding, as the two figures that mean different things.
     *
     * Resident is what is actually in RAM and virtual is what has been mapped, which for a JVM or a
     * process using memory-mapped files are far apart and only one of them is the machine's problem.
     * Both in MB on one axis, since they are the same unit and the gap between them is the point.
     */
    private buildMemoryChart(real: MetricPoint[], virtual: MetricPoint[]): Record<string, unknown> {
        const realOf = new Map(real.map(point => [point.timestamp, point.value]));
        const virtualOf = new Map(virtual.map(point => [point.timestamp, point.value]));
        const buckets = [...new Set([...realOf.keys(), ...virtualOf.keys()])].sort();

        return {
            title: {
                text: 'Memory',
                subtext: `What the ${this.target.toUpperCase()} process itself holds, MB`,
                left: 'center',
                textStyle: {fontSize: 14},
                subtextStyle: {fontSize: 10},
            },
            tooltip: {trigger: 'axis', valueFormatter: (value: number) => `${value?.toFixed(0)} MB`},
            legend: {bottom: 0, textStyle: {fontSize: 10}},
            grid: {left: '3%', right: '4%', bottom: 30, top: 60, containLabel: true},
            xAxis: {
                type: 'category',
                data: buckets.map(bucket => new Date(bucket).toLocaleTimeString()),
                axisLabel: {fontSize: 10},
            },
            yAxis: {type: 'value', min: 0, name: 'MB', nameTextStyle: {fontSize: 10}, axisLabel: {fontSize: 10}},
            series: [
                {
                    name: 'Resident',
                    type: 'line',
                    showSymbol: false,
                    smooth: true,
                    areaStyle: {opacity: 0.1},
                    data: buckets.map(bucket => realOf.get(bucket) ?? null),
                    itemStyle: {color: '#004a9f'},
                },
                {
                    name: 'Virtual',
                    type: 'line',
                    showSymbol: false,
                    smooth: true,
                    data: buckets.map(bucket => virtualOf.get(bucket) ?? null),
                    itemStyle: {color: '#c8781e'},
                },
            ],
        };
    }

    /**
     * Every series the module has, over the buckets that came back.
     *
     * The axis is the union of their buckets rather than any one series' own, because they do not all
     * have the same ones: a method called twice this afternoon has two, the memory gauges have every
     * one. Pairing each series back onto that axis by timestamp is what keeps a sparse series under the
     * right labels instead of bunched up at the left.
     */
    private buildHistoryChart(series: StoredSeries[]): Record<string, unknown> {
        const buckets = [...new Set(series.flatMap(one => one.points.map(point => point.timestamp)))].sort();
        const lines = series.map(one => {
            const valueOf = new Map(one.points.map(point => [point.timestamp, point.value]));
            return {
                name: one.display,
                type: 'line',
                showSymbol: false,
                connectNulls: true,
                data: buckets.map(bucket => valueOf.get(bucket) ?? null),
            };
        });
        return {
            title: {
                text: 'Recorded history',
                subtext: `Every metric this module has, one point per ${RAW_PERIOD_MINUTES} minutes`,
                left: 'center',
                textStyle: {fontSize: 14},
                subtextStyle: {fontSize: 10},
            },
            tooltip: {trigger: 'axis'},
            grid: {left: '3%', right: '4%', bottom: '3%', top: 60, containLabel: true},
            xAxis: {
                type: 'category',
                data: buckets.map(bucket => new Date(bucket).toLocaleTimeString()),
                axisLabel: {fontSize: 10},
            },
            yAxis: {type: 'value'},
            series: lines,
        };
    }
}
