export type AssessmentCategory = 'Architecture' | 'Quality' | 'Security' | 'General';
export type AssessmentSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AssessmentStatus = 'Open' | 'In Progress' | 'Resolved';

export interface AssessmentRecord {
    id: string;
    category: AssessmentCategory;
    severity: AssessmentSeverity;
    description: string;
    status: AssessmentStatus;
    assignee?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class MvpAssessmentTracker {
    private records: Map<string, AssessmentRecord> = new Map();

    /**
     * Adds a new assessment finding to the tracker.
     */
    public addRecord(
        category: AssessmentCategory,
        severity: AssessmentSeverity,
        description: string,
        assignee?: string
    ): AssessmentRecord {
        const id = `MVP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const record: AssessmentRecord = {
            id,
            category,
            severity,
            description,
            status: 'Open',
            assignee,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.records.set(id, record);
        return record;
    }

    /**
     * Retrieves all tracked records.
     */
    public getRecords(): AssessmentRecord[] {
        return Array.from(this.records.values());
    }

    /**
     * Retrieves a specific record by its ID.
     */
    public getRecordById(id: string): AssessmentRecord | undefined {
        return this.records.get(id);
    }

    /**
     * Updates the status of an existing record.
     */
    public updateStatus(id: string, status: AssessmentStatus): AssessmentRecord | null {
        const record = this.records.get(id);
        if (!record) return null;

        record.status = status;
        record.updatedAt = new Date();
        this.records.set(id, record);
        return record;
    }

    /**
     * Clears all tracking data (useful for test resets).
     */
    public clearAll(): void {
        this.records.clear();
    }
}