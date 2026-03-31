export enum IssueType {
    ARCHITECTURE = 'ARCHITECTURE',
    QUALITY = 'QUALITY',
    SECURITY = 'SECURITY'
}

export interface AssessmentIssue {
    id: string;
    type: IssueType;
    description: string;
    isResolved: boolean;
}

export class MvpAssessmentTracker {
    private issues: Map<string, AssessmentIssue> = new Map();

    /**
     * Logs a new issue found during the MVP assessment.
     */
    public logIssue(id: string, type: IssueType, description: string): void {
        this.issues.set(id, { id, type, description, isResolved: false });
    }

    /**
     * Marks an existing issue as resolved.
     * @returns boolean True if the issue was found and resolved, false otherwise.
     */
    public resolveIssue(id: string): boolean {
        const issue = this.issues.get(id);
        if (issue) {
            issue.isResolved = true;
            this.issues.set(id, issue);
            return true;
        }
        return false;
    }

    /**
     * Retrieves all unresolved issues that block MVP sign-off.
     */
    public getPendingIssues(): AssessmentIssue[] {
        return Array.from(this.issues.values()).filter(issue => !issue.isResolved);
    }
}