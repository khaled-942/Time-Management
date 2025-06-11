import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'sum',
    standalone: true
})
export class SumPipe implements PipeTransform {
    transform(items: any[], prop: string): number {
        return items
            ? items.reduce((a, b) => a + (b[prop] || 0), 0)
            : 0;
    }
}