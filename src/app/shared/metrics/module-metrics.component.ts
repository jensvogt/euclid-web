import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {Location} from '@angular/common';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {MatTableModule} from '@angular/material/table';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {BarChart, LineChart} from 'echarts/charts';
import {GridComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {interval, Subscription} from 'rxjs';

import {FooterComponent} from '../footer/footer.component';
import {autoReloadPeriod} from '../list/euclid-list.component';
import {EuclidModule, moduleOf} from './euclid-modules';
import {MetricSample, MetricsService} from './metrics.service';

// Only the pieces of echarts this page draws with, so the bundle carries a bar chart and a line chart
// rather than all of echarts.
echarts.use([BarChart, LineChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

/** How many readings of each series to keep. At a minute apart that is the last few hours. */
const HISTORY = 120;

/**
 * One module's metrics: what it reads now, and how the readings have moved since this page was opened.
 *
 * euclid's monitoring answers with a flat list of samples rather than a time series - `get-metrics` is a
 * reading, not a history - so the history here is the one this page has watched. Reloading the page starts
 * it again, which is honest: nothing was recorded while nobody was looking.
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

    samples: MetricSample[] = [];
    columns = ['name', 'type', 'value'];

    gaugeOptions: Record<string, unknown> = {};
    historyOptions: Record<string, unknown> = {};

    /** series name -> the readings seen, oldest first. */
    private readonly history = new Map<string, number[]>();
    private readonly timestamps: string[] = [];
    private updateSubscription: Subscription | undefined;

    constructor(
        private readonly route: ActivatedRoute,
        private readonly metricsService: MetricsService,
        private readonly snackBar: MatSnackBar,
        private readonly location: Location,
    ) {
    }

    ngOnInit(): void {
        this.target = this.route.snapshot.paramMap.get('target') ?? '';
        this.module = moduleOf(this.target);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    back(): void {
        this.location.back();
    }

    refresh(): void {
        this.load();
    }

    load(): void {
        if (!this.target) {
            return;
        }
        this.metricsService.labelled(this.target).subscribe({
            next: (samples: MetricSample[]) => {
                this.lastUpdate = new Date();
                this.samples = [...samples].sort((left, right) => left.name.localeCompare(right.name));
                this.record(this.samples);
                this.gaugeOptions = this.buildGaugeChart(this.samples);
                this.historyOptions = this.buildHistoryChart();
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    /** Appends this reading to each series, padding a series that only appeared now so every one is the same length. */
    private record(samples: MetricSample[]): void {
        this.timestamps.push(new Date().toLocaleTimeString());
        if (this.timestamps.length > HISTORY) {
            this.timestamps.shift();
        }
        const length = this.timestamps.length;

        for (const sample of samples) {
            const series = this.history.get(sample.name) ?? new Array<number>(length - 1).fill(0);
            series.push(sample.value);
            while (series.length > length) {
                series.shift();
            }
            this.history.set(sample.name, series);
        }
    }

    private buildGaugeChart(samples: MetricSample[]): Record<string, unknown> {
        return {
            title: {text: 'Current readings', left: 'center', textStyle: {fontSize: 14}},
            tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}},
            grid: {left: '3%', right: '4%', bottom: '3%', top: 50, containLabel: true},
            xAxis: {type: 'value'},
            yAxis: {type: 'category', data: samples.map(sample => sample.name), axisLabel: {fontSize: 10}},
            series: [{
                type: 'bar',
                data: samples.map(sample => sample.value),
                itemStyle: {color: '#004a9f'},
            }],
        };
    }

    private buildHistoryChart(): Record<string, unknown> {
        const series = [...this.history.entries()].map(([name, values]) => ({
            name: name,
            type: 'line',
            showSymbol: false,
            data: values,
        }));
        return {
            title: {text: 'Since this page was opened', left: 'center', textStyle: {fontSize: 14}},
            tooltip: {trigger: 'axis'},
            grid: {left: '3%', right: '4%', bottom: '3%', top: 50, containLabel: true},
            xAxis: {type: 'category', data: this.timestamps, axisLabel: {fontSize: 10}},
            yAxis: {type: 'value'},
            series: series,
        };
    }
}
