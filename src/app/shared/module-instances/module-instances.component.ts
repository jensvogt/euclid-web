import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {MatCard, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {NgxEchartsDirective, provideEchartsCore} from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {BarChart} from 'echarts/charts';
import {GridComponent, LegendComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {interval, Subscription} from 'rxjs';
import type {Module} from 'euclid-ndk';

import {EmmService} from '../../modules/emm/service/emm.service';
import {autoReloadPeriod} from '../list/euclid-list.component';

/**
 * The state an instance that is actually serving is in.
 *
 * Written out rather than imported: euclid-ndk names it `MODULE_RUNNING`, but the SDK is a type-only
 * dependency here - its runtime signs with `node:crypto` and must never reach the bundle - so a value
 * from it would be the one import that does. The same reason every other state string in this app is
 * a constant of its own.
 */
const RUNNING = 'RUNNING';

// Only what this card draws, so the bundle carries a bar chart rather than all of echarts.
echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/**
 * How many rows the chart draws. Past this it is a list rather than a chart - see `rowsOf`.
 *
 * Ten is also what the shared chart height was chosen to fit: every chart on the dashboard is that one
 * height, and this is the densest of them.
 */
const TOP = 10;

/** As wide as ten rows in that height leave room for, which is what keeps the bars from touching. */
const BAR_WIDTH = 14;

const RUNNING_COLOUR = '#004a9f';
const SHORT_COLOUR = '#c8781e';
const ROOM_COLOUR = 'rgba(0, 0, 0, 0.08)';

/**
 * How many processes each module is running, against how many it may.
 *
 * Horizontal because the labels are module names: a name reads along a row without being turned on its
 * side or cut, and there are a dozen of them rather than a dozen hundred.
 *
 * Two bars stacked into one: what is running, and the room left to its maximum. The second is drawn in
 * the background colour rather than left out, so a pool at two of eight and a pool at two of two are
 * told apart at a glance - which is the question this chart exists to answer.
 *
 * A module switched off in the manager's configuration is left out entirely. Nothing is waiting for it,
 * so a bar at zero would read as something that has gone wrong.
 */
@Component({
    selector: 'module-instances',
    templateUrl: './module-instances.component.html',
    styleUrls: ['./module-instances.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, NgxEchartsDirective],
    providers: [provideEchartsCore({echarts})],
})
export class ModuleInstancesComponent implements OnInit, OnDestroy {

    options: Record<string, unknown> = {};

    /** The line under the heading: how the installation stands, or why there is nothing to show. */
    summary = '';
    note = '';

    private readonly registry = inject(EmmService);
    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    private load(): void {
        this.registry.listModules().subscribe({
            next: (modules: Module[]) => {
                this.note = '';
                const rows = rowsOf(modules);
                if (rows.length === 0) {
                    this.summary = 'The registry has no modules switched on.';
                    this.options = {};
                    return;
                }
                // Over every module the registry has, not only the rows drawn: the figures are about the
                // installation, and one that reported the ten busiest would answer a smaller question
                // than the one it looks like it is answering.
                const counted = modules.filter((module: Module) => module.active);
                const running = counted.reduce(
                    (sum, module) => sum + (module.instances ?? []).filter(one => one.state === RUNNING).length,
                    0,
                );
                const short = counted.filter(
                    (module) => (module.instances ?? []).filter(one => one.state === RUNNING).length < (module.minInstances ?? 0),
                ).length;
                const shown = counted.length > rows.length ? `, busiest ${rows.length} shown` : '';
                this.summary = short === 0
                    ? `${running} instances across ${counted.length} modules, all at their minimum${shown}`
                    : `${running} instances across ${counted.length} modules,`
                        + ` ${short} below the minimum asked of ${short === 1 ? 'it' : 'them'}${shown}`;
                this.options = chartOf(rows);
            },
            error: (error: Error) => {
                this.note = error.message;
                this.options = {};
            },
        });
    }
}

/** One row: a module, what it is running, and what it may run. */
interface ModuleRow {
    name: string;
    running: number;
    minInstances: number;
    maxInstances: number;
}

/**
 * The modules worth drawing, busiest first.
 *
 * Sorted ascending and read bottom-up, which is the same thing: a category axis draws its first entry
 * at the bottom, so the busiest module ends up at the top where it is looked for. Ties fall back to the
 * name, so a row does not change places between readings just because two pools are the same size.
 *
 * The busiest ten of them, which `slice(-TOP)` takes from the tail of an ascending list: the point of
 * the chart is which pools are carrying the installation, and a row per module turns that into a list
 * of every module with the answer somewhere in it. What is left out is counted in the line above.
 */
function rowsOf(modules: Module[]): ModuleRow[] {
    return modules
        .filter((module: Module) => module.active)
        .map((module: Module) => ({
            name: module.name.toLowerCase(),
            running: (module.instances ?? []).filter(instance => instance.state === RUNNING).length,
            minInstances: module.minInstances ?? 0,
            maxInstances: Math.max(module.maxInstances ?? 0, (module.instances ?? []).length),
        }))
        .sort((left, right) => left.running - right.running || right.name.localeCompare(left.name))
        .slice(-TOP);
}

/** The bars: what is running, and the room above it. */
function chartOf(rows: ModuleRow[]): Record<string, unknown> {
    return {
        tooltip: {
            trigger: 'axis',
            axisPointer: {type: 'shadow'},
            // The room is not a figure anybody asked about, so the tooltip says the pair instead.
            formatter: (params: {dataIndex: number}[]) => {
                const row = rows[params[0]?.dataIndex ?? 0];
                return `${row.name}<br/>${row.running} running of ${row.maxInstances}`
                    + `<br/>minimum ${row.minInstances}`;
            },
        },
        // The same padding on every dashboard chart, so their plots are the same size and not merely
        // their boxes. `containLabel` makes these the room around the labels rather than around the axes.
        grid: {left: 8, right: 16, top: 8, bottom: 4, containLabel: true},
        xAxis: {type: 'value', minInterval: 1, axisLabel: {fontSize: 10}},
        yAxis: {
            type: 'category',
            data: rows.map(row => row.name),
            axisTick: {show: false},
            axisLabel: {fontSize: 11},
        },
        series: [
            {
                name: 'Running',
                type: 'bar',
                stack: 'instances',
                barMaxWidth: BAR_WIDTH,
                data: rows.map(row => ({
                    value: row.running,
                    // Short of what was asked of it, which is the one state worth picking out.
                    itemStyle: {color: row.running < row.minInstances ? SHORT_COLOUR : RUNNING_COLOUR},
                })),
            },
            {
                name: 'Room',
                type: 'bar',
                stack: 'instances',
                barMaxWidth: BAR_WIDTH,
                itemStyle: {color: ROOM_COLOUR},
                data: rows.map(row => Math.max(0, row.maxInstances - row.running)),
            },
        ],
    };
}
