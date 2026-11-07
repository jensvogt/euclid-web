import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {MatCard, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {MatTooltip} from '@angular/material/tooltip';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {GaugeChart} from 'echarts/charts';
import {CanvasRenderer} from 'echarts/renderers';
import {forkJoin, interval, Subscription} from 'rxjs';

import {autoReloadPeriod} from '../list/euclid-list.component';
import {
    MetricsService,
    SYSTEM_CPU_METRIC,
    SYSTEM_LOAD_METRIC,
    SYSTEM_MEMORY_METRIC,
    SYSTEM_QUEUE_METRIC,
} from '../metrics/metrics.service';

// The one chart this card draws, so the bundle carries a gauge rather than all of echarts.
echarts.use([GaugeChart, CanvasRenderer]);

/** One figure of the three, as the card draws it. */
export interface LoadFigure {
    label: string;
    /** What was read, or null when nothing has been recorded - which is a dash, not a zero. */
    value: number | null;
    /** What to print in the middle: a percentage, or a bare number for a run queue. */
    text: string;
    /** Whether the machine is at or past the point this figure is a problem at. */
    hot: boolean;
    /** The line under the gauge: what the figure is, and where it becomes a problem. */
    caption: string;
    tooltip: string;
    /** The gauge, built once per reading rather than per change-detection pass. */
    options: Record<string, unknown>;
}

/** Where the arc turns, as a share of the figure's own full scale. */
const WARN = 0.75;

/** The arc: what it has reached, and what it has not. */
const COLOUR = '#004a9f';
const HOT_COLOUR = '#c8781e';
const TRACK = 'rgba(0, 0, 0, 0.08)';

/**
 * What the machines euclid runs on are doing, as three figures.
 *
 * The host's, not euclid's: these come from what the monitoring module samples of the machine, folded
 * across every host it has readings for. The per-module figures - what one process holds - are on that
 * module's own monitoring page, and are a different question.
 *
 * CPU and load are both here because they disagree in the way that matters: a host can sit at 100% CPU
 * with nothing waiting, which is busy and keeping up, or below it with a long run queue behind slow
 * disks, which is not. Neither figure says that on its own.
 */
@Component({
    selector: 'system-load',
    templateUrl: './system-load.component.html',
    styleUrls: ['./system-load.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, NgxEchartsDirective, MatTooltip],
    providers: [provideEchartsCore({echarts})],
})
export class SystemLoadComponent implements OnInit, OnDestroy {

    figures: LoadFigure[] = [];

    /** Said instead of the figures when the monitoring module will not answer at all. */
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

    /**
     * Reads the three, and asks for both forms of the load figure.
     *
     * Exactly one of those two answers: euclid records a load average or a processor queue depending on
     * the platform it was built for, so asking for the absent one comes back empty and neither this
     * page nor the service has to know, or guess, which operating system is at the other end.
     */
    private load(): void {
        forkJoin({
            cpu: this.metricsService.latest(SYSTEM_CPU_METRIC),
            memory: this.metricsService.latest(SYSTEM_MEMORY_METRIC),
            load: this.metricsService.latest(SYSTEM_LOAD_METRIC),
            queue: this.metricsService.latest(SYSTEM_QUEUE_METRIC),
        }).subscribe({
            next: ({cpu, memory, load, queue}) => {
                this.note = '';
                this.figures = [
                    percentFigure(
                        'CPU',
                        cpu,
                        'Processor in use, averaged over every host this installation has readings for.',
                        'What the machines are using of their processors. Not what euclid itself is using -'
                            + " that is on each module's own monitoring page.",
                    ),
                    percentFigure(
                        'Memory',
                        memory,
                        'Memory in use. The page cache does not count as used.',
                        'What the machines are using of their memory, total less what the kernel says is'
                            + ' available - so the page cache does not count as used.',
                    ),
                    loadFigure(load, queue),
                ];
            },
            error: (error: Error) => {
                this.figures = [];
                this.note = error.message;
            },
        });
    }
}

/** A figure that is already a percentage, which both of the first two are. */
function percentFigure(label: string, value: number | null, caption: string, tooltip: string): LoadFigure {
    const percent = value ?? 0;
    const hot = value !== null && percent / 100 >= WARN;
    return {
        label: label,
        value: value,
        text: value === null ? '—' : `${Math.round(percent)}%`,
        hot: hot,
        caption: `${caption} Amber from ${WARN * 100}%.`,
        tooltip: tooltip,
        options: gaugeOf(label, value === null ? 0 : percent, 100, value === null ? '—' : `${Math.round(percent)}%`, hot),
    };
}

/**
 * The run queue, under whichever name this platform records it.
 *
 * Not a percentage and not bounded: a machine with work queued behind every core reads well above its
 * saturation point, and that is the reading worth seeing - so the number in the middle is shown as it
 * is and only the arc stops at full. The scale differs with the name, which is why they are not given
 * the same one: a Linux load average saturates at one per core, while the guidance for a Windows
 * processor queue is that a sustained two per processor is the bottleneck.
 */
function loadFigure(load: number | null, queue: number | null): LoadFigure {
    const isQueue = load === null && queue !== null;
    const value = load ?? queue;
    const saturation = isQueue ? 2 : 1;
    const hot = value !== null && value >= saturation;
    const label = isQueue ? 'Queue / CPU' : 'Load / core';
    return {
        label: label,
        value: value,
        text: value === null ? '—' : value.toFixed(2),
        hot: hot,
        caption: isQueue
            ? `Threads waiting per processor. Amber from ${saturation}, the point Windows calls a bottleneck.`
            : `Work waiting per core. Amber from ${saturation}, which is saturation whatever the hardware.`,
        tooltip: isQueue
            ? 'Threads waiting per processor, as Windows reports it. A sustained two per processor is a bottleneck.'
            : 'The one-minute load average divided by the core count, which means the same thing on every host:'
                + ' one per core is saturation whatever the hardware.',
        options: gaugeOf(label, value === null ? 0 : Math.min(value, saturation), saturation,
                         value === null ? '—' : value.toFixed(2), hot),
    };
}

/**
 * One arc, with the reading in the middle and what it is under it.
 *
 * A three-quarter arc rather than a full circle, which is what makes an empty one read as empty: a ring
 * closed on itself has no start, so a gauge at nothing looks the same as a gauge nobody has drawn.
 *
 * The value drives the arc and the text is given rather than formatted from it, because the two are not
 * always the same thing - a queue past saturation fills the arc and still prints its own number.
 */
function gaugeOf(label: string, value: number, max: number, text: string, hot: boolean): Record<string, unknown> {
    return {
        series: [{
            type: 'gauge',
            startAngle: 210,
            endAngle: -30,
            min: 0,
            max: max,
            radius: '92%',
            center: ['50%', '58%'],
            progress: {show: true, width: 12, itemStyle: {color: hot ? HOT_COLOUR : COLOUR}},
            axisLine: {lineStyle: {width: 12, color: [[1, TRACK]]}},
            axisTick: {show: false},
            splitLine: {show: false},
            axisLabel: {show: false},
            pointer: {show: false},
            anchor: {show: false},
            detail: {
                valueAnimation: false,
                offsetCenter: [0, '-8%'],
                fontSize: 22,
                color: hot ? HOT_COLOUR : 'inherit',
                formatter: () => text,
            },
            title: {offsetCenter: [0, '32%'], fontSize: 12, color: 'inherit'},
            data: [{value: value, name: label}],
        }],
    };
}
