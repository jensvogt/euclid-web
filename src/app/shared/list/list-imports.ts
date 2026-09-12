import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardActions, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatFormField, MatLabel, MatSuffix} from '@angular/material/form-field';
import {MatIcon} from '@angular/material/icon';
import {MatInput} from '@angular/material/input';
import {MatListItem, MatNavList} from '@angular/material/list';
import {MatMenuModule} from '@angular/material/menu';
import {MatPaginator} from '@angular/material/paginator';
import {MatSortModule} from '@angular/material/sort';
import {MatTableModule} from '@angular/material/table';
import {MatTooltip} from '@angular/material/tooltip';
import {RouterLink} from '@angular/router';

import {FooterComponent} from '../footer/footer.component';

/**
 * What every list view's template needs.
 *
 * One array rather than the same forty imports pasted into nine components: the list views are all the
 * same card, toolbar, table and paginator, so a standalone component that is one of them asks for this.
 */
export const EUCLID_LIST_IMPORTS = [
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatCardActions,
    MatIconButton,
    MatIcon,
    MatTooltip,
    MatMenuModule,
    MatDivider,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatInput,
    MatTableModule,
    MatSortModule,
    MatPaginator,
    MatNavList,
    MatListItem,
    CdkCopyToClipboard,
    FormsModule,
    RouterLink,
    AsyncPipe,
    FooterComponent,
];
