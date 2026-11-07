import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatListModule} from '@angular/material/list';
import {MatTooltipModule} from '@angular/material/tooltip';

import {DashboardComponent} from './dashboard.component';
import {DashboardRoutingModule} from './dashboard-routing.module';
import {FooterComponent} from '../../shared/footer/footer.component';
import {SystemLoadComponent} from '../../shared/system-load/system-load.component';
import {GatewaySeriesComponent} from '../../shared/gateway-series/gateway-series.component';
import {ManagerUsageComponent} from '../../shared/manager-usage/manager-usage.component';
import {ModuleInstancesComponent} from '../../shared/module-instances/module-instances.component';
import {WeeklyTrafficComponent} from '../../shared/weekly-traffic/weekly-traffic.component';

@NgModule({
    declarations: [DashboardComponent],
    imports: [
        CommonModule,
        DashboardRoutingModule,
        MatCardModule,
        MatGridListModule,
        MatListModule,
        MatTooltipModule,
        SystemLoadComponent,
        WeeklyTrafficComponent,
        ModuleInstancesComponent,
        GatewaySeriesComponent,
        ManagerUsageComponent,
        FooterComponent,
    ],
    exports: [DashboardComponent],
})
export class DashboardModule {
}
