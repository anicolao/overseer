import { MvpAssessmentTracker } from '../../src/tools/MvpAssessmentTracker';

describe('MvpAssessmentTracker', () => {
    let tracker: MvpAssessmentTracker;

    beforeEach(() => {
        tracker = new MvpAssessmentTracker();
    });

    test('should add a new assessment record with correct defaults', () => {
        const record = tracker.addRecord('Architecture', 'High', 'Lack of modularity in core engine');
        
        expect(record.id).toMatch(/^MVP-[A-Z0-9]+$/);
        expect(record.category).toBe('Architecture');
        expect(record.severity).toBe('High');
        expect(record.status).toBe('Open');
        expect(record.description).toBe('Lack of modularity in core engine');
        expect(tracker.getRecords().length).toBe(1);
    });

    test('should retrieve all records correctly', () => {
        tracker.addRecord('Security', 'Critical', 'Exposed API keys');
        tracker.addRecord('Quality', 'Medium', 'Missing test coverage for utils');
        
        const records = tracker.getRecords();
        expect(records.length).toBe(2);
        expect(records[0].category).toBe('Security');
        expect(records[1].category).toBe('Quality');
    });

    test('should retrieve a specific record by ID', () => {
        const newRecord = tracker.addRecord('General', 'Low', 'Update documentation');
        const fetchedRecord = tracker.getRecordById(newRecord.id);
        
        expect(fetchedRecord).toBeDefined();
        expect(fetchedRecord?.id).toBe(newRecord.id);
    });

    test('should update the status of an existing record', () => {
        const record = tracker.addRecord('Quality', 'Low', 'Typo in README');
        const updatedRecord = tracker.updateStatus(record.id, 'Resolved');
        
        expect(updatedRecord).not.toBeNull();
        expect(updatedRecord?.status).toBe('Resolved');
        expect(updatedRecord?.updatedAt.getTime()).toBeGreaterThanOrEqual(record.createdAt.getTime());
    });

    test('should return null when updating a non-existent record', () => {
        const updatedRecord = tracker.updateStatus('MVP-INVALID-ID', 'Resolved');
        expect(updatedRecord).toBeNull();
    });

    test('should clear all records successfully', () => {
        tracker.addRecord('Security', 'High', 'Dependency vulnerabilities');
        expect(tracker.getRecords().length).toBe(1);
        
        tracker.clearAll();
        expect(tracker.getRecords().length).toBe(0);
    });
});