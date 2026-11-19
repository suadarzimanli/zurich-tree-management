/*
    TreeManagementZurich — database script (SR + Inspection + Work Order)
    Run in SSMS or sqlcmd. Safe to re-run (IF NOT EXISTS guards).
*/

SET NOCOUNT ON;
GO

IF DB_ID(N'TreeManagementZurich') IS NULL
    CREATE DATABASE TreeManagementZurich;
GO

USE TreeManagementZurich;
GO

/* ── Service requests ─────────────────────────────────────────────────────── */

IF OBJECT_ID(N'dbo.TMZ_ServiceRequest', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_ServiceRequest (
        SrNumber                BIGINT          NOT NULL IDENTITY(10001, 1),
        Status                  NVARCHAR(64)    NOT NULL CONSTRAINT DF_TMZ_SR_Status DEFAULT (N'In Progress'),
        SubStatus               NVARCHAR(128)   NULL,
        Area                    NVARCHAR(128)   NOT NULL CONSTRAINT DF_TMZ_SR_Area DEFAULT (N'Tree Maintenance'),
        SubArea                 NVARCHAR(128)   NOT NULL,
        RequestType             NVARCHAR(256)   NOT NULL,
        LinkedTreeBaumnummer    NVARCHAR(64)    NOT NULL,
        OgdObjectId             INT             NULL,
        OgdSpeciesGerman        NVARCHAR(256)   NULL,
        OgdSpeciesLatin         NVARCHAR(256)   NULL,
        OgdQuartier             NVARCHAR(128)   NULL,
        OgdStreet               NVARCHAR(256)   NULL,
        OgdPlantingYear         INT             NULL,
        OgdCategory             NVARCHAR(128)   NULL,
        OgdStatus               NVARCHAR(128)   NULL,
        ContactFirstName        NVARCHAR(128)   NOT NULL,
        ContactLastName         NVARCHAR(128)   NOT NULL,
        ContactEmail            NVARCHAR(256)   NOT NULL,
        ContactPhone            NVARCHAR(64)    NULL,
        Description             NVARCHAR(MAX)   NULL,
        Address                 NVARCHAR(512)   NULL,
        GisLatitude             FLOAT           NOT NULL,
        GisLongitude            FLOAT           NOT NULL,
        OpenedDate              DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_SR_Opened DEFAULT (SYSUTCDATETIME()),
        Source                  NVARCHAR(64)    NOT NULL CONSTRAINT DF_TMZ_SR_Source DEFAULT (N'Map App'),
        CreatedAtUtc            DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_SR_Created DEFAULT (SYSUTCDATETIME()),
        UpdatedAtUtc            DATETIME2(0)    NULL,
        CONSTRAINT PK_TMZ_ServiceRequest PRIMARY KEY CLUSTERED (SrNumber)
    );
END
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'Area') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD Area NVARCHAR(128) NOT NULL
        CONSTRAINT DF_TMZ_SR_Area_Alt DEFAULT (N'Tree Maintenance') WITH VALUES;
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'SubArea') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD SubArea NVARCHAR(128) NOT NULL
        CONSTRAINT DF_TMZ_SR_SubArea_Alt DEFAULT (N'General Requests') WITH VALUES;
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'Priority') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD Priority NVARCHAR(32) NOT NULL
        CONSTRAINT DF_TMZ_SR_Priority DEFAULT (N'Normal') WITH VALUES;
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'ClosedDate') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD ClosedDate DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'CreatedBy') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD CreatedBy NVARCHAR(128) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_ServiceRequest', N'AssignedTo') IS NULL
    ALTER TABLE dbo.TMZ_ServiceRequest ADD AssignedTo NVARCHAR(128) NULL;
GO

/* ── Inspections (auto-created with SR; one per SR) ─────────────────────────── */

IF OBJECT_ID(N'dbo.TMZ_Inspection', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_Inspection (
        InspectionId            BIGINT          NOT NULL IDENTITY(1, 1),
        SrNumber                BIGINT          NOT NULL,
        Status                  NVARCHAR(64)    NOT NULL CONSTRAINT DF_TMZ_Insp_Status DEFAULT (N'Created'),
        LinkedTreeBaumnummer    NVARCHAR(64)    NOT NULL,
        InspectDate             DATETIME2(0)    NULL,
        Comment                 NVARCHAR(MAX)   NULL,
        InternalComment         NVARCHAR(MAX)   NULL,
        WorkOrderType           NVARCHAR(100)   NULL,
        GisLatitude             FLOAT           NOT NULL,
        GisLongitude            FLOAT           NOT NULL,
        CreatedAtUtc            DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_Insp_Created DEFAULT (SYSUTCDATETIME()),
        ClosedAtUtc             DATETIME2(0)    NULL,
        UpdatedAtUtc            DATETIME2(0)    NULL,
        CONSTRAINT PK_TMZ_Inspection PRIMARY KEY CLUSTERED (InspectionId),
        CONSTRAINT UQ_TMZ_Inspection_SrNumber UNIQUE (SrNumber),
        CONSTRAINT FK_TMZ_Inspection_SR FOREIGN KEY (SrNumber)
            REFERENCES dbo.TMZ_ServiceRequest (SrNumber)
    );
END
GO

IF COL_LENGTH(N'dbo.TMZ_Inspection', N'Inspector') IS NULL
    ALTER TABLE dbo.TMZ_Inspection ADD Inspector NVARCHAR(128) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_Inspection', N'Findings') IS NULL
    ALTER TABLE dbo.TMZ_Inspection ADD Findings NVARCHAR(64) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_Inspection', N'Priority') IS NULL
    ALTER TABLE dbo.TMZ_Inspection ADD Priority NVARCHAR(32) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_Inspection', N'EHAP') IS NULL
    ALTER TABLE dbo.TMZ_Inspection ADD EHAP BIT NOT NULL
        CONSTRAINT DF_TMZ_Insp_EHAP DEFAULT (0) WITH VALUES;
GO

/* ── Work orders (created when Inspection → Resolution) ───────────────────── */

IF OBJECT_ID(N'dbo.TMZ_WorkOrder', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_WorkOrder (
        WorkOrderId             BIGINT          NOT NULL IDENTITY(1, 1),
        SrNumber                BIGINT          NOT NULL,
        InspectionId            BIGINT          NOT NULL,
        Status                  NVARCHAR(64)    NOT NULL CONSTRAINT DF_TMZ_WO_Status DEFAULT (N'Created'),
        WorkOrderType           NVARCHAR(100)   NOT NULL CONSTRAINT DF_TMZ_WO_Type DEFAULT (N'Unassigned'),
        LinkedTreeBaumnummer    NVARCHAR(64)    NOT NULL,
        InternalComment         NVARCHAR(MAX)   NULL,
        Contractor              NVARCHAR(400)   NULL,
        FieldComments           NVARCHAR(MAX)   NULL,
        GisLatitude             FLOAT           NOT NULL,
        GisLongitude            FLOAT           NOT NULL,
        StartDate               DATETIME2(0)    NULL,
        WorkDate                DATETIME2(0)    NULL,
        CreatedAtUtc            DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_WO_Created DEFAULT (SYSUTCDATETIME()),
        ClosedAtUtc             DATETIME2(0)    NULL,
        UpdatedAtUtc            DATETIME2(0)    NULL,
        CONSTRAINT PK_TMZ_WorkOrder PRIMARY KEY CLUSTERED (WorkOrderId),
        CONSTRAINT UQ_TMZ_WorkOrder_SrNumber UNIQUE (SrNumber),
        CONSTRAINT FK_TMZ_WorkOrder_SR FOREIGN KEY (SrNumber)
            REFERENCES dbo.TMZ_ServiceRequest (SrNumber),
        CONSTRAINT FK_TMZ_WorkOrder_Inspection FOREIGN KEY (InspectionId)
            REFERENCES dbo.TMZ_Inspection (InspectionId)
    );
END
GO

IF COL_LENGTH(N'dbo.TMZ_WorkOrder', N'Priority') IS NULL
    ALTER TABLE dbo.TMZ_WorkOrder ADD Priority NVARCHAR(32) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_WorkOrder', N'AssignedTo') IS NULL
    ALTER TABLE dbo.TMZ_WorkOrder ADD AssignedTo NVARCHAR(128) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_WorkOrder', N'InspBy') IS NULL
    ALTER TABLE dbo.TMZ_WorkOrder ADD InspBy NVARCHAR(128) NULL;
GO

IF COL_LENGTH(N'dbo.TMZ_WorkOrder', N'ProjectCode') IS NULL
    ALTER TABLE dbo.TMZ_WorkOrder ADD ProjectCode NVARCHAR(64) NULL;
GO

/* ── Indexes ─────────────────────────────────────────────────────────────── */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_ServiceRequest_Status_Opened' AND object_id = OBJECT_ID(N'dbo.TMZ_ServiceRequest'))
    CREATE INDEX IX_TMZ_ServiceRequest_Status_Opened ON dbo.TMZ_ServiceRequest (Status, OpenedDate DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_ServiceRequest_SubArea' AND object_id = OBJECT_ID(N'dbo.TMZ_ServiceRequest'))
    CREATE INDEX IX_TMZ_ServiceRequest_SubArea ON dbo.TMZ_ServiceRequest (SubArea) INCLUDE (SrNumber, Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_ServiceRequest_Geo' AND object_id = OBJECT_ID(N'dbo.TMZ_ServiceRequest'))
    CREATE INDEX IX_TMZ_ServiceRequest_Geo ON dbo.TMZ_ServiceRequest (GisLatitude, GisLongitude);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_Inspection_Status' AND object_id = OBJECT_ID(N'dbo.TMZ_Inspection'))
    CREATE INDEX IX_TMZ_Inspection_Status ON dbo.TMZ_Inspection (Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_WorkOrder_Status' AND object_id = OBJECT_ID(N'dbo.TMZ_WorkOrder'))
    CREATE INDEX IX_TMZ_WorkOrder_Status ON dbo.TMZ_WorkOrder (Status);
GO

PRINT N'TreeManagementZurich schema ready (SR, Inspection, Work Order).';
GO

/* ── Activity plans & activities (Zurich forestry workflow) ─────────────── */

IF OBJECT_ID(N'dbo.TMZ_ActivityPlan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_ActivityPlan (
        PlanId          INT             NOT NULL IDENTITY(1, 1),
        SubArea         NVARCHAR(128)   NOT NULL,
        Name            NVARCHAR(256)   NOT NULL,
        IsActive        BIT             NOT NULL CONSTRAINT DF_TMZ_Plan_Active DEFAULT (1),
        CreatedAtUtc    DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_Plan_Created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_TMZ_ActivityPlan PRIMARY KEY CLUSTERED (PlanId)
    );
END
GO

IF OBJECT_ID(N'dbo.TMZ_ActivityPlanStep', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_ActivityPlanStep (
        StepId              INT             NOT NULL IDENTITY(1, 1),
        PlanId              INT             NOT NULL,
        StepOrder           INT             NOT NULL,
        Name                NVARCHAR(256)   NOT NULL,
        ActivityType        NVARCHAR(64)    NOT NULL,
        DefaultAssignee     NVARCHAR(128)   NULL,
        DueDaysOffset       INT             NOT NULL CONSTRAINT DF_TMZ_Step_Due DEFAULT (0),
        Description         NVARCHAR(512)   NULL,
        CONSTRAINT PK_TMZ_ActivityPlanStep PRIMARY KEY CLUSTERED (StepId),
        CONSTRAINT FK_TMZ_Step_Plan FOREIGN KEY (PlanId) REFERENCES dbo.TMZ_ActivityPlan (PlanId)
    );
END
GO

IF OBJECT_ID(N'dbo.TMZ_SrActivityPlan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_SrActivityPlan (
        SrPlanId            BIGINT          NOT NULL IDENTITY(1, 1),
        SrNumber            BIGINT          NOT NULL,
        PlanId              INT             NOT NULL,
        CurrentStepOrder    INT             NOT NULL CONSTRAINT DF_TMZ_SrPlan_Step DEFAULT (1),
        Status              NVARCHAR(32)    NOT NULL CONSTRAINT DF_TMZ_SrPlan_Status DEFAULT (N'Active'),
        StartedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_SrPlan_Started DEFAULT (SYSUTCDATETIME()),
        CompletedAtUtc      DATETIME2(0)    NULL,
        CONSTRAINT PK_TMZ_SrActivityPlan PRIMARY KEY CLUSTERED (SrPlanId),
        CONSTRAINT UQ_TMZ_SrActivityPlan_Sr UNIQUE (SrNumber),
        CONSTRAINT FK_TMZ_SrPlan_SR FOREIGN KEY (SrNumber) REFERENCES dbo.TMZ_ServiceRequest (SrNumber),
        CONSTRAINT FK_TMZ_SrPlan_Plan FOREIGN KEY (PlanId) REFERENCES dbo.TMZ_ActivityPlan (PlanId)
    );
END
GO

IF OBJECT_ID(N'dbo.TMZ_Activity', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMZ_Activity (
        ActivityId          BIGINT          NOT NULL IDENTITY(1, 1),
        SrNumber            BIGINT          NOT NULL,
        PlanStepId          INT             NULL,
        ActivityType        NVARCHAR(64)    NOT NULL,
        Status              NVARCHAR(32)    NOT NULL CONSTRAINT DF_TMZ_Act_Status DEFAULT (N'Open'),
        Subject             NVARCHAR(256)   NOT NULL,
        Notes               NVARCHAR(MAX)   NULL,
        AssignedTo          NVARCHAR(128)   NULL,
        DueDate             DATETIME2(0)    NULL,
        CompletedAtUtc      DATETIME2(0)    NULL,
        CreatedBy           NVARCHAR(128)   NULL,
        IsSystemGenerated   BIT             NOT NULL CONSTRAINT DF_TMZ_Act_System DEFAULT (0),
        CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_TMZ_Act_Created DEFAULT (SYSUTCDATETIME()),
        UpdatedAtUtc        DATETIME2(0)    NULL,
        CONSTRAINT PK_TMZ_Activity PRIMARY KEY CLUSTERED (ActivityId),
        CONSTRAINT FK_TMZ_Act_SR FOREIGN KEY (SrNumber) REFERENCES dbo.TMZ_ServiceRequest (SrNumber),
        CONSTRAINT FK_TMZ_Act_Step FOREIGN KEY (PlanStepId) REFERENCES dbo.TMZ_ActivityPlanStep (StepId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TMZ_Activity_SrNumber' AND object_id = OBJECT_ID(N'dbo.TMZ_Activity'))
    CREATE INDEX IX_TMZ_Activity_SrNumber ON dbo.TMZ_Activity (SrNumber, CreatedAtUtc DESC);
GO

/* Seed activity plan templates (one per SR sub-area) */
IF NOT EXISTS (SELECT 1 FROM dbo.TMZ_ActivityPlan)
BEGIN
    INSERT INTO dbo.TMZ_ActivityPlan (SubArea, Name) VALUES
        (N'Pruning Requests', N'Pruning — standard forestry plan'),
        (N'Tree Planting Requests', N'Tree planting — standard plan'),
        (N'Stump Removal Requests', N'Stump removal — standard plan'),
        (N'General Information', N'General information — response plan'),
        (N'Other', N'Urgent / other — expedited plan');

    DECLARE @Pruning INT = (SELECT PlanId FROM dbo.TMZ_ActivityPlan WHERE SubArea = N'Pruning Requests');
    DECLARE @Planting INT = (SELECT PlanId FROM dbo.TMZ_ActivityPlan WHERE SubArea = N'Tree Planting Requests');
    DECLARE @Stump INT = (SELECT PlanId FROM dbo.TMZ_ActivityPlan WHERE SubArea = N'Stump Removal Requests');
    DECLARE @Info INT = (SELECT PlanId FROM dbo.TMZ_ActivityPlan WHERE SubArea = N'General Information');
    DECLARE @Other INT = (SELECT PlanId FROM dbo.TMZ_ActivityPlan WHERE SubArea = N'Other');

    INSERT INTO dbo.TMZ_ActivityPlanStep (PlanId, StepOrder, Name, ActivityType, DefaultAssignee, DueDaysOffset, Description) VALUES
        (@Pruning, 1, N'Triage citizen report', N'Triage', N'Forestry clerk', 0, N'Review SR details and priority'),
        (@Pruning, 2, N'Field inspection', N'SiteVisit', N'Field inspector', 2, N'On-site tree assessment'),
        (@Pruning, 3, N'Schedule pruning work', N'WorkOrderScheduled', N'Operations', 5, N'Create and assign work order'),
        (@Pruning, 4, N'Complete pruning work', N'WorkCompleted', N'Contractor', 10, N'Confirm work done and close SR'),

        (@Planting, 1, N'Triage planting request', N'Triage', N'Forestry clerk', 0, N'Validate location and species request'),
        (@Planting, 2, N'Site suitability visit', N'SiteVisit', N'Field inspector', 3, N'Check soil, space, utilities'),
        (@Planting, 3, N'Schedule planting', N'WorkOrderScheduled', N'Operations', 7, N'Plan seasonal planting window'),
        (@Planting, 4, N'Planting completed', N'WorkCompleted', N'Contractor', 21, N'Record new tree in follow-up'),

        (@Stump, 1, N'Triage stump removal', N'Triage', N'Forestry clerk', 0, N'Confirm ownership and urgency'),
        (@Stump, 2, N'Site inspection', N'SiteVisit', N'Field inspector', 2, N'Measure stump and access'),
        (@Stump, 3, N'Schedule stump grinding', N'WorkOrderScheduled', N'Operations', 5, N'Book contractor slot'),
        (@Stump, 4, N'Stump work completed', N'WorkCompleted', N'Contractor', 10, N'Verify site restored'),

        (@Info, 1, N'Review inquiry', N'Triage', N'Forestry clerk', 0, N'Read citizen question'),
        (@Info, 2, N'Research & respond', N'Note', N'Forestry clerk', 2, N'Answer using Baumkataster data'),
        (@Info, 3, N'Close information SR', N'WorkCompleted', N'Forestry clerk', 3, N'Mark resolved — no field work'),

        (@Other, 1, N'Urgent triage', N'Triage', N'Duty officer', 0, N'Assess safety risk (EHAP if needed)'),
        (@Other, 2, N'Emergency site visit', N'SiteVisit', N'Field inspector', 1, N'On-site within 24h for urgent cases'),
        (@Other, 3, N'Schedule remedial work', N'WorkOrderScheduled', N'Operations', 3, N'Prioritise crew dispatch'),
        (@Other, 4, N'Remedial work completed', N'WorkCompleted', N'Contractor', 7, N'Confirm hazard removed');
END
GO

PRINT N'Activity plans and activities schema ready.';
GO
