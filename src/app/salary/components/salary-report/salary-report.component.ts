import { Component, OnInit } from '@angular/core';
import { SalaryService } from '../../services/salary.service';
import { SalaryCalculation } from '../../models/salary.models';

@Component({
    selector: 'app-salary-report',
    templateUrl: './salary-report.component.html',
    styleUrls: ['./salary-report.component.scss']
})
export class SalaryReportComponent implements OnInit {
    calculations: SalaryCalculation[] = [];
    selectedPeriod: 'week' | 'month' | 'year' = 'month';

    constructor(private salaryService: SalaryService) { }

    ngOnInit(): void {
        // In a real application, we would load historical calculations here
    }

    exportReport(): void {
        // Implement export functionality
    }
}