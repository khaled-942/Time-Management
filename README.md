# Time Management Application

A comprehensive time management and scheduling application built with Angular 18. This application helps users manage their time efficiently with features like calendar management, user authentication, and administrative controls.

## Features

- User Authentication (Login/Register)
- Interactive Calendar Management
- User Profile Management
- Administrative Dashboard
- National Days Overview
- Responsive Layout with Side Navigation
- Time Management Dashboard
- Salary Calculator Based on Working Hours

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Angular CLI (v18.2.6)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Run the development server:

```bash
npm start
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Project Structure

```
src/
├── app/
│   ├── auth/           # Authentication components and services
│   ├── layout/         # Layout components (nav-bar, side-bar, etc.)
│   └── shared/         # Shared components, services, and utilities
```

## Main Components

- **Authentication**: Handles user login and registration
- **Calendar**: Full calendar implementation for event management
- **Profile**: User profile management
- **Admin Dashboard**: Administrative controls and overview
- **Time Management Dashboard**: Main interface for time management features

## Testing

Run unit tests:

```bash
npm test
```

## Building for Production

Build the project:

```bash
npm run build
```

Build artifacts will be stored in the `dist/` directory.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License.
