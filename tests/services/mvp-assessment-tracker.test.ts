import { MvpAssessmentTracker, IssueType } from '../../src/services/mvp-assessment-tracker';

describe('MvpAssessmentTracker functional tests', () => {
    let tracker: MvpAssessmentTracker;

    beforeEach(() => {
        tracker = new MvpAssessmentTracker();
    });

    it('should successfully log a new issue', () => {
        tracker.logIssue('TASK-1', IssueType.SECURITY, 'Identify and patch vulnerable dependencies');
        
        const pending = tracker.getPendingIssues();
        expect(pending.length).toBe(1);
        expect(pending[0].id).toBe('TASK-1');
        expect(pending[0].type).toBe(IssueType.SECURITY);
        expect(pending[0].isResolved).toBe(false);
    });

    it('should resolve an existing issue and remove it from pending', () => {
        tracker.logIssue('TASK-2', IssueType.QUALITY, 'Increase test coverage for core modules');
        expect(tracker.getPendingIssues().length).toBe(1);
        
        const wasResolved = tracker.resolveIssue('TASK-2');
        
        expect(wasResolved).toBe(true);
        expect(tracker.getPendingIssues().length).toBe(0);
    });

    it('should return false when attempting to resolve a non-existent issue', () => {
        const wasResolved = tracker.resolveIssue('NON-EXISTENT-TASK');
        expect(wasResolved).toBe(false);
    });

    it('should correctly filter only pending issues', () => {
        tracker.logIssue('TASK-3', IssueType.ARCHITECTURE, 'Refactor tight coupling in routing');
        tracker.logIssue('TASK-4', IssueType.QUALITY, 'Fix linter warnings');
        
        tracker.resolveIssue('TASK-3');
        
        const pending = tracker.getPendingIssues();
        expect(pending.length).toBe(1);
        expect(pending[0].id).toBe('TASK-4');
    });
});