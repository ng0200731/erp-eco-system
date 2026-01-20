# Agent Skills System

A comprehensive skill tracking and documentation system for the ERP web application.

## Features

- **Skill Documentation**: Track technical skills, implementations, and achievements
- **Version Control**: Maintain skill versions and status tracking
- **Web Integration**: View and manage skills through the web interface
- **JSON-based Storage**: Skills stored as structured JSON files

## Skill Structure

Each skill is documented in a JSON file with the following structure:

```json
{
  "name": "skill-name",
  "description": "Brief description of the skill",
  "version": "1.0.0",
  "status": "completed|in-progress|planned",
  "category": "frontend|backend|database|deployment|design",
  "tags": ["tag1", "tag2"],
  "changes": [
    {
      "component": "ComponentName",
      "description": "What was changed",
      "impact": "How it affects the application"
    }
  ],
  "dependencies": ["skill1", "skill2"],
  "created": "2026-01-19",
  "updated": "2026-01-19"
}
```

## Usage

### Creating a New Skill

1. Create a new JSON file in the `skills/` directory
2. Follow the skill structure template
3. The skill will automatically appear in the web interface

### Skill Status

- `planned`: Skill is planned but not started
- `in-progress`: Currently working on this skill
- `completed`: Skill implementation is finished
- `deprecated`: Skill is no longer relevant

## Integration

Skills are integrated into the main web application through:
- Skills panel in the sidebar (K menu)
- REST API endpoints for skill management
- Real-time skill status updates


