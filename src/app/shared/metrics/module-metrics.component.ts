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
        forkJoin({
            readings: this.metricsService.readings(this.target),
            times: this.metricsService.history(this.timeMetric, RESPONSE_BUCKETS),
            calls: this.metricsService.history(this.countMetric, RESPONSE_BUCKETS),
        }).subscribe({
            next: ({readings, times, calls}: {readings: ModuleReadings; times: MetricPoint[]; calls: MetricPoint[]}) => {
                this.lastUpdate = new Date();
                this.note = '';
                this.samples = readings.latest;
                this.asOf = readings.asOf;
                this.gaugeOptions = this.buildGaugeChart(readings.latest);
                this.historyOptions = this.buildHistoryChart(readings.series);

                this.served = times.length > 0 || calls.length > 0;
                this.responseOptions = this.served ? this.buildResponseChart(times, calls) : {};
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
