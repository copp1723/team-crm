# File Organization Standards

This document outlines the file organization standards for the Team CRM project to ensure maintainability and consistency.

## Directory Structure

```
team-crm/
├── src/                          # Source code
│   ├── core/                     # Core business logic
│   │   ├── agents/              # AI agents and assistants
│   │   ├── analytics/           # Analytics and reporting
│   │   ├── calendar/            # Calendar integration
│   │   ├── database/            # Database connections and schema
│   │   ├── email/               # Email processing
│   │   ├── ingestion/           # Data ingestion
│   │   ├── intelligence/        # AI intelligence engines
│   │   ├── jobs/                # Background job processing
│   │   ├── memory/              # Memory and context management
│   │   ├── notifications/       # Notification systems
│   │   ├── orchestration/       # System orchestration
│   │   ├── voice/               # Voice processing
│   │   └── webhooks/            # Webhook integrations
│   ├── ai/                      # AI processing modules
│   ├── api/                     # REST API endpoints
│   ├── middleware/              # Express middleware
│   ├── utils/                   # Utility functions
│   ├── websocket/               # WebSocket handling
│   └── collaboration/           # Team collaboration features
├── config/                      # Configuration files
├── scripts/                     # Utility and setup scripts
├── test/                        # Test files
│   ├── examples/                # Demo and example files
│   └── integration/             # Integration tests
├── web-interface/               # Frontend HTML/CSS/JS
├── docs/                        # Documentation
└── public/                      # Static assets
```

## File Organization Rules

### 1. Core Features Organization

**Rule**: All new features get their own directory under `src/core/`

**Examples**:
- Email processing → `src/core/email/`
- Calendar integration → `src/core/calendar/`
- Webhook handling → `src/core/webhooks/`

### 2. No Duplicate Files

**Rule**: Enhance existing files rather than creating duplicates

**Bad**:
```
executive-dashboard.html
executive-dashboard-complex.html
executive-dashboard-old.html
```

**Good**:
```
executive-dashboard.html (single, enhanced version)
```

### 3. Consistent Naming Conventions

**Rule**: Follow existing naming patterns

**Patterns**:
- Kebab-case for files: `team-orchestrator.js`
- PascalCase for classes: `TeamOrchestrator`
- Camelcase for functions: `processTeamUpdate`

### 4. Centralized Configuration

**Rule**: Keep configuration centralized in `config/`

**Structure**:
```
config/
├── team-config.json      # Team member configuration
├── feature-flags.json    # Feature toggles
└── environment/          # Environment-specific configs
```

## Cleanup Requirements

### 1. Temporary File Removal

**Rule**: Remove temporary files after processing

**Patterns to clean**:
- `*.tmp`
- `*.temp`
- `*~`
- `*.bak`
- `*.log` (except intentional logs)
- `.DS_Store`

### 2. Logger Usage

**Rule**: Use existing logger patterns from `src/utils/logger.js`

**Bad**:
```javascript
console.log('Processing update');
console.error('Error occurred:', error);
```

**Good**:
```javascript
import { logger } from '../utils/logger.js';

logger.info('Processing update');
logger.error('Error occurred', { error });
```

### 3. Error Handling Patterns

**Rule**: Follow existing error handling patterns

**Pattern**:
```javascript
try {
    // Operation
    logger.info('Operation started');
    const result = await someOperation();
    logger.info('Operation completed', { result });
    return result;
} catch (error) {
    logger.error('Operation failed', { error });
    throw error;
}
```

### 4. Code Style Consistency

**Rule**: Maintain consistent code style with existing codebase

**Guidelines**:
- Use ES6+ modules (`import`/`export`)
- Use async/await over Promises
- Include JSDoc comments for public methods
- Use destructuring where appropriate
- Consistent indentation (4 spaces)

## File Placement Guidelines

### Test Files
- Unit tests: `test/`
- Integration tests: `test/integration/`
- Examples and demos: `test/examples/`

### Scripts
- Setup scripts: `scripts/`
- Maintenance scripts: `scripts/`
- Database scripts: `scripts/`

### Documentation
- Technical docs: `docs/`
- API documentation: Generated at runtime
- README files: Root and relevant subdirectories

### Web Interface
- HTML files: `web-interface/`
- Static assets: `public/`
- Component scripts: `web-interface/` (if small) or `src/` (if complex)

## Maintenance Scripts

### Automated Cleanup

Run the maintenance script regularly:

```bash
npm run cleanup:maintenance
```

This script will:
- Remove temporary files
- Move misplaced files to correct locations
- Identify and remove duplicate files
- Generate cleanup reports

### Manual Checks

Periodically review:
- File organization compliance
- Logger usage consistency
- Error handling patterns
- Code style consistency

## Enforcement

### Pre-commit Checks

Consider adding pre-commit hooks to enforce:
- File naming conventions
- Logger usage
- No temporary files in commits

### Code Review Guidelines

During code reviews, check for:
- Proper file placement
- Use of existing utilities (logger, error handling)
- No duplicate functionality
- Consistent naming and style

## Migration Guide

When reorganizing existing code:

1. **Plan the move**: Identify all files that need to be moved
2. **Update imports**: Ensure all import paths are updated
3. **Test thoroughly**: Run all tests after reorganization
4. **Update documentation**: Reflect changes in docs
5. **Clean up**: Remove old, unused files

## Examples

### Good File Organization

```
src/core/email/
├── assistant-email-handler.js    # Main handler
├── context-extractor.js          # Context extraction
├── email-parser.js               # Email parsing
├── email-router.js               # Routing logic
└── mailgun-client.js             # External service client
```

### Good Logger Usage

```javascript
import { logger } from '../../utils/logger.js';

export class EmailProcessor {
    async processEmail(email) {
        const timer = logger.time('email-processing');
        
        try {
            logger.info('Processing email', { 
                from: email.from, 
                subject: email.subject 
            });
            
            const result = await this.extractContext(email);
            
            timer.end({ success: true });
            return result;
            
        } catch (error) {
            logger.error('Email processing failed', { 
                error, 
                email: email.id 
            });
            timer.end({ success: false });
            throw error;
        }
    }
}
```

## Conclusion

Following these file organization standards ensures:
- **Maintainability**: Easy to find and modify code
- **Consistency**: Predictable structure and patterns
- **Scalability**: Clear places for new features
- **Quality**: Consistent logging and error handling

Regular maintenance and adherence to these standards will keep the codebase clean and professional.