import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
        // Only run client-only calculations in the browser (skip during SSR/prerender)
        if (isPlatformBrowser(this.platformId)) {
            this.onPeriodChange();
        }
    }

    onConfigSubmit() {
        if (this.configForm.valid) {
            const config: SalaryConfig = this.configForm.value;
            this.salaryService.updateConfig(config);
            this.onPeriodChange(); // Recalculate with new config
        }
    }


    async onPeriodChange() {
        const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
        console.log(isBrowser ? localStorage.getItem('user') : null);

        if (this.periodStart && this.periodEnd) {
            try {
                const user = isBrowser ? localStorage.getItem('user') : null;
                const userId = user ? JSON.parse(user).id : null;

                if (!userId) {
                    // No userId in SSR or not logged in — skip calculation gracefully
                    this.calculation = undefined;
                    return; // early return instead of throwing
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