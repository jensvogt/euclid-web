import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';

import {EuclidHttpService} from '../../services/euclid-http.service';

/** The paired metrics every module records around each action it serves: `MonitoringTimer`'s two names. */
export function serviceTimeMetric(target: string): string {
    return `${target}-service-time`;
}

export function serviceCountMetric(target: string): string {
    return `${target}-service-count`;
}

/**
 * What every module process records about itself, and the label that says which process.
 *
 * Recorded by `HttpActionServer`'s own sampler rather than by any module's code, which is why the
 * metric is one series for the whole installation and the module is a label on it - see
 * recordCpuUsage() and recordMemoryUsage(). A page about one module therefore has to ask for its own
 * label rather than for the metric, or it gets every module's figures folded into one line.
 */
export const PROCESS_CPU_METRIC = 'euclid-cpu-usage';
export const PROCESS_MEMORY_REAL_METRIC = 'euclid-memory-usage-real-mb';
export const PROCESS_MEMORY_VIRTUAL_METRIC = 'euclid-memory-usage-virtual-mb';
export const MODULE_LABEL = 'module';

/**
 * One bucket of one series, as emo's `list` answers: a row per label per bucket.
 *
 * A GAUGE is what the readings averaged to over the bucket - how long a method took, how much memory -
 * and a RATE is what accumulated over it, which is why the two are never combined and never plotted on
 * one axis. `samples` is how many readings are behind the figure, and so how much a gauge is worth when
 * it is averaged with others.
 */
interface MonitoringRow {
    name: string;
    labels?: Record<string, string>;
    labelName: string;
    labelValue: string;
    value: number;
    minValue: number;
    maxValue: number;
    samples: number;
    type: string;
    resolution: string;
    timestamp: string;
}

/** One bucket of a series, folded across the metric's labels. */
export interface MetricPoint {
    timestamp: string;
    value: number;
}

/** One stored row, with a name to show. The raw name stays: it is what a series has to be matched on. */
export interface StoredSample {
    display: string;
    name: string;
    value: number;
    samples: number;
    type: string;
    timestamp: string;
}

/** One series of a module's history: every bucket one metric and label pair has. */
export interface StoredSeries {
    display: string;
    points: MetricPoint[];
}

/** What a module has recorded, as the monitoring module holds it. */
export interface ModuleReadings {
    /** The newest bucket's timestamp, empty when the module has recorded nothing yet. */
    asOf: string;
    /** That bucket's rows, which is the most recent complete reading of the module there is. */
    latest: StoredSample[];
    /** Every row as a series, oldest bucket first. */
    series: StoredSeries[];
}

/** What one RAW bucket covers: emo's `euclid.modules.emo.average-period`, five minutes by default. */
export const RAW_PERIOD_MINUTES = 5;

/** How many labels one bucket of a service metric can hold - a module serves tens of actions, not hundreds. */
const LABEL_CAP = 64;

/**
 * How many rows one unfiltered read asks for.
 *
 * This is the cap on a read that cannot narrow by name, so it is shared out across every module's
 * metrics - which makes it the limit on how far back that history reaches rather than on which metrics
 * appear in it. Rows come back newest-first, so what a too-small cap loses is the oldest buckets.
 */
const ROW_SCAN = 2000;

/** `name{label=value}`, or the bare name when the metric has no dimensions. */
function displayOf(row: MonitoringRow): string {
    if (row.labelName && row.labelValue) {
        return `${row.name}{${row.labelName}=${row.labelValue}}`;
    }
    const labels = Object.entries(row.labels ?? {});
    if (labels.length === 0) {
        return row.name;
    }
    return `${row.name}{${labels.map(([label, value]) => `${label}=${value}`).join(',')}}`;
}

/**
 * Whether a stored row is one of this module's.
 *
 * Two ways, because euclid names its metrics two ways. What a module records about its own work carries
 * its name - `esm-service-time`, `eam-current-users` - while what the process records about itself is
 * one metric across all of them, told apart by a label: `euclid-cpu-usage{module=esm}`.
 */
function belongsTo(row: MonitoringRow, target: string): boolean {
    if (row.name.startsWith(`${target}-`)) {
        return true;
    }
    return (row.labelName === 'module' && row.labelValue === target) || row.labels?.['module'] === target;
}

/**
 * Folds the rows of one metric into a point per bucket, oldest first.
 *
 * The rule is emo's own, and the reason the row carries its type: a RATE is the total over its labels
 * - twenty actions' call counts add up to the module's - while a GAUGE is their sample-weighted mean,
 * since averaging a mean service time without its call count reports a method called once as heavily
 * as one called a thousand times.
 */
function foldIntoBuckets(rows: MonitoringRow[], limit: number): MetricPoint[] {
    const buckets = new Map<string, {total: number; weighted: number; samples: number; rate: boolean}>();
    for (const row of rows) {
        const bucket = buckets.get(row.timestamp) ?? {total: 0, weighted: 0, samples: 0, rate: false};
        const samples = typeof row.samples === 'number' ? row.samples : 0;
        bucket.total += row.value;
        bucket.weighted += row.value * samples;
        bucket.samples += samples;
        // Every row of one metric carries the same type, so the last one read decides for the bucket.
        bucket.rate = row.type?.toUpperCase() === 'RATE';
        buckets.set(row.timestamp, bucket);
    }

    // Fixed-width UTC ISO8601, so sorting the keys as text puts the buckets in order without parsing a date.
    const ordered = [...buckets.keys()].sort();

    // A response that hit the row cap was cut newest-first, which leaves its oldest bucket holding only
    // some of its labels. It would plot as a dip that never happened, so it goes.
    if (rows.length >= limit) {
        ordered.shift();
    }

    const points: MetricPoint[] = [];
    for (const timestamp of ordered) {
        const bucket = buckets.get(timestamp);
        if (!bucket) {
            continue;
        }
        points.push({
            timestamp: timestamp,
            value: bucket.rate ? bucket.total : bucket.samples > 0 ? bucket.weighted / bucket.samples : 0,
        });
    }
    return points;
}

/** The newest bucket as a reading, and every row as a series. */
function readingsOf(rows: MonitoringRow[]): ModuleReadings {
    const series = new Map<string, MetricPoint[]>();
    let asOf = '';
    for (const row of rows) {
        const display = displayOf(row);
        const points = series.get(display) ?? [];
        points.push({timestamp: row.timestamp, value: row.value});
        series.set(display, points);
        if (row.timestamp > asOf) {
            asOf = row.timestamp;
        }
    }

    const latest: StoredSample[] = [];
    for (const row of rows) {
        if (row.timestamp === asOf) {
            latest.push({
                display: displayOf(row),
                name: row.name,
                value: row.value,
                samples: row.samples,
                type: row.type,
                timestamp: row.timestamp,
            });
        }
    }

    return {
        asOf: asOf,
        latest: latest.sort((left, right) => left.display.localeCompare(right.display)),
        series: [...series.entries()]
            .map(([display, points]) => ({
                display: display,
                points: points.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
            }))
            .sort((left, right) => left.display.localeCompare(right.display)),
    };
}

/**
 * What the monitoring module has stored, which is where a module's metrics have to be read from.
 *
 * Not from the module itself: `get-metrics` empties the collector it reads, and every module process
 * pushes to emo every ten seconds, so asking a module directly answers with whatever happened in the
 * gap between two pushes - on a quiet installation, nothing at all. emo keeps what was pushed, in
 * buckets, which is both a history and - in its newest bucket - the most recent complete reading there
 * is. Reading it wants an administrator, which asking a module for its own metrics does not.
 */
@Injectable({providedIn: 'root'})
export class MetricsService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /**
     * Everything one module has recorded, from one read.
     *
     * No name filter, because a module's metric names are not knowable in advance: the service pair is
     * the same everywhere, but `eam-current-users` or `ets-files-received` belong to one module each and
     * a page that asked only for the names it knew would quietly hide the rest.
     */
    readings(target: string, limit: number = ROW_SCAN): Observable<ModuleReadings> {
        return this.http.all<MonitoringRow>('emo', 'list', 'items', {limit: limit, resolution: 'RAW'}).pipe(
            map((rows: MonitoringRow[]) => readingsOf(rows.filter(row => belongsTo(row, target)))),
        );
    }

    /**
     * One metric's history, folded across its labels into a point per bucket.
     *
     * Asked for by name rather than taken from `readings`, which cannot promise depth: its cap is shared
     * with every other module's metrics. This one is narrowed to a single metric, so the cap buys buckets
     * of it - which is what a chart of one thing over time needs.
     */
    history(
        metric: string,
        buckets: number,
        label?: {name: string; value: string},
        resolution: 'RAW' | 'HOUR' | 'DAY' = 'RAW',
    ): Observable<MetricPoint[]> {
        // A metric narrowed to one label has one row per bucket rather than one per label, so the same
        // cap buys a hundred times the history. A metric asked for whole still needs the room.
        const limit = label ? buckets : buckets * LABEL_CAP;
        const payload: Record<string, unknown> = {name: metric, limit: limit, resolution: resolution};
        if (label) {
            payload['labelName'] = label.name;
            payload['labelValue'] = label.value;
        }
        return this.http.all<MonitoringRow>('emo', 'list', 'items', payload).pipe(
            map((rows: MonitoringRow[]) => foldIntoBuckets(rows, limit)),
        );
    }
}
