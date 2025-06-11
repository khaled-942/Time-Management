import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SalaryService } from '../../services/salary.service';
import { SalaryConfig, SalaryCalculation } from '../../models/salary.models';
import { AuthService } from "../../../auth/auth.service";

@Component({
    selector: 'app-salary-calculator',
    templateUrl: './salary-calculator.component.html',
    styleUrls: ['./salary-calculator.component.scss']
})
export class SalaryCalculatorComponent implements OnInit {
    configForm: FormGroup;
    calculation?: SalaryCalculation;
    periodStart: Date = new Date();
    periodEnd: Date = new Date();

    constructor(
        private fb: FormBuilder,
        private salaryService: SalaryService,
        private authService: AuthService, // Inject AuthService
        @Inject(PLATFORM_ID) private platformId: Object // Keep for other potential platform-specific logic if any
    ) {
        this.configForm = this.fb.group({
            monthlyBaseSalary: [0, [Validators.required, Validators.min(0)]],
            hourlyRate: [0, [Validators.required, Validators.min(0)]],
            overtimeRate: [1.5, [Validators.required, Validators.min(1)]],
            regularHours: [8, [Validators.required, Validators.min(0)]]
        });
    }

    ngOnInit() {
        // Initialize period dates
        this.periodStart = new Date();
        this.periodStart.setDate(1); // First day of current month
        this.periodEnd = new Date();
        this.periodEnd.setMonth(this.periodEnd.getMonth() + 1, 0); // Last day of current month

        // Subscribe to config changes
        this.salaryService.salaryConfig$.subscribe(config => {
            this.configForm.patchValue(config, { emitEvent: false });
        });

        // Initial calculation
        this.onPeriodChange();
    }

    onConfigSubmit() {
        if (this.configForm.valid) {
            const config: SalaryConfig = this.configForm.value;
            this.salaryService.updateConfig(config);
            this.onPeriodChange(); // Recalculate with new config
        }
    }

    async onPeriodChange() {
        if (this.periodStart && this.periodEnd) {
            try {
                const user = localStorage.getItem('user');
                const userId = user ? JSON.parse(user).id : null;

                if (!userId) {
                    console.error('User not authenticated or user ID not available.');
                    this.calculation = undefined;
                    throw new Error('User ID not available for salary calculation.');
                }

                this.calculation = await this.salaryService.calculateSalaryForPeriod(
                    userId,
                    this.periodStart,
                    this.periodEnd
                );
            } catch (error) {
                console.error('Error in onPeriodChange while calculating salary:', error);
                this.calculation = undefined;
                // TODO: Implement user-friendly error display in the template
            }
        }
    }
}