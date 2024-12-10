import { Component } from '@angular/core';
import { HomePageComponent } from './home-page/home-page.component';
import { NavBarComponent } from './nav-bar/nav-bar.component';
import { SideBarComponent } from './side-bar/side-bar.component';

@Component({
  selector: 'app-layout',
  imports: [HomePageComponent, SideBarComponent, NavBarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  standalone:true,
})
export class LayoutComponent {

}
