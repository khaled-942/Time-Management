// src/app/services/avatar.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export interface Avatar {
  name: string;
  url: string;
}

@Injectable({
  providedIn: 'root',
})
export class AvatarService {
  private uiAvatarsBaseUrl = 'https://ui-avatars.com/api/';

  constructor(private http: HttpClient) {}

  // Generate avatars based on different name variations
  generateAvatars(name: string): Avatar[] {
    const backgrounds = ['0D8ABC', 'FFA500', '7CB342', 'FF5722', '9C27B0'];
    const names = [
      name,
      name?.split(' ')[0],
      name
        ?.split(' ')
        .map((n) => n[0])
        .join(''),
    ];

    console.log(names);

    return names.map((avatarName, index) => ({
      name: avatarName,
      url: `${this.uiAvatarsBaseUrl}?name=${encodeURIComponent(
        avatarName
      )}&background=${
        backgrounds[index % backgrounds.length]
      }&color=fff&size=256`,
    }));
  }

  // Simulate avatar selection (in a real app, this would be a backend call)
  updateUserAvatar(avatarUrl: string): Observable<any> {
    // Simulate API call
    return of({ success: true, avatarUrl });
  }
}
