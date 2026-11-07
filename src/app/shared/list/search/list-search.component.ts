import {Component, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatIconButton} from '@angular/material/button';
import {MatError, MatFormField, MatLabel, MatSuffix} from '@angular/material/form-field';
import {MatIcon} from '@angular/material/icon';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatInput} from '@angular/material/input';

import {ListSearch, MATCH_TYPES, MatchType} from '../match-type';

/**
 * The box every list view narrows itself with, and how the text in it is matched.
 *
 * One component rather than the same form field in sixteen templates, which is what it was: the label
 * differed and nothing else did. The match type is the reason it is worth having as one - a picker
 * added here is added everywhere, and a listing whose action cannot take one says so by setting
 * {@link ListSearch.matchTypes} false rather than by having a different box.
 *
 * Matching happens at the server, not here. The text goes out with the query and the server quotes it
 * for everything but `regex`, so a page of ten is ten of everything that matched rather than ten rows
 * filtered down to whatever happened to be on screen.
 */
@Component({
    selector: 'list-search',
    templateUrl: './list-search.component.html',
    styleUrls: ['./list-search.component.scss'],
    standalone: true,
    imports: [
        FormsModule,
        MatFormField,
        MatLabel,
        MatError,
        MatInput,
        MatSuffix,
        MatIconButton,
        MatIcon,
        MatSelect,
        MatOption,
    ],
})
export class ListSearchComponent {

    /** The view this narrows. A narrow interface, so a list of one thing is as good as any other. */
    @Input({required: true}) list!: ListSearch;

    /** What the field is called: what is being matched, where the picker beside it says how. */
    @Input() label = 'Search';

    protected readonly matchTypes = MATCH_TYPES;

    /** What an empty box is waiting for, which for a regex is worth an example rather than "Search". */
    get placeholder(): string {
        return this.list.matchTypes && this.list.matchTypeValue === 'regex' ? 'A regular expression' : 'Search';
    }

    /**
     * Whether what has been typed is a pattern the server will refuse.
     *
     * Checked here as well as there because the two agree about what a regular expression is, and a
     * refusal that arrives as a red line under the box beats one that arrives as a snackbar after a
     * round trip. The server still checks: this is a courtesy, not the rule.
     */
    get badPattern(): boolean {
        if (!this.list.matchTypes || this.list.matchTypeValue !== 'regex' || !this.list.prefixValue) {
            return false;
        }
        try {
            new RegExp(this.list.prefixValue);
            return false;
        } catch {
            return true;
        }
    }

    choose(type: MatchType): void {
        this.list.setMatchType(type);
    }

    search(): void {
        if (!this.badPattern) {
            this.list.setPrefix();
        }
    }
}
