import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SalaryCalculatorComponent } from './components/salary-calculator/salary-calculator.component';
import { SalaryReportComponent } from './components/salary-report/salary-report.component';
import { SumPipe } from '../shared/pipes/sum.pipe';

// PrimeNG Imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CalendarModule } from 'primeng/calendar';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';

@NgModule({
    declarations: [
        SalaryCalculatorComponent,
        SalaryReportComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        RouterModule.forChild([
            { path: 'calculator', component: SalaryCalculatorComponent },
            { path: 'report', component: SalaryReportComponent }
        ]),
        // PrimeNG Modules
        ButtonModule,
        InputTextModule,
        CalendarModule,
        TableModule,
        CardModule,
        SumPipe
    ]
})
export class SalaryModule { }