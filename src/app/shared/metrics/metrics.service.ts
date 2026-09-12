import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';

import {EuclidHttpService} from '../../services/euclid-http.service';

/**
 * One sample, as euclid's `MonitoringCollector` hands it out.
 *
 * A gauge is a reading - how many threads, how much memory - and a rate is a count per second the server
 * has already divided out, so the two are not plotted on one axis.
 */
export interface MetricSample {
    name: string;
    labelName: string;
    labelValue: string;
    value: number;
    type: 'gauge' | 'rate';
}

/**
 * Every module's `get-metrics`, which is the same action nine times over.
 *
 * `HttpActionServer::MetricsResponse` answers with `{items: [...]}` whatever the module, so there is one
 * service here rather than a metrics method on each of the nine.
 */
@Injectable({providedIn: 'root'})
export class MetricsService {

    constructor(private readonly http: EuclidHttpService) {
    }

    metrics(target: string): Observable<MetricSample[]> {
        return this.http.all<MetricSample>(target, 'get-metrics', 'items');
    }

    /** The same, with the samples that carry a label folded into `name{label=value}` for display. */
    labelled(target: string): Observable<MetricSample[]> {
        return this.metrics(target).pipe(
            map((samples: MetricSample[]) => samples.map(sample => ({
                ...sample,
                name: sample.labelValue ? `${sample.name}{${sample.labelName}=${sample.labelValue}}` : sample.name,
            }))),
        );
    }
}
