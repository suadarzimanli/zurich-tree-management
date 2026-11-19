using Microsoft.EntityFrameworkCore;
using ZurichTreeManagement.Web.Data.Entities;

namespace ZurichTreeManagement.Web.Data;

public sealed class ZurichDbContext : DbContext
{
    public ZurichDbContext(DbContextOptions<ZurichDbContext> options) : base(options) { }

    public DbSet<TmzServiceRequest> ServiceRequests => Set<TmzServiceRequest>();
    public DbSet<TmzInspection> Inspections => Set<TmzInspection>();
    public DbSet<TmzWorkOrder> WorkOrders => Set<TmzWorkOrder>();
    public DbSet<TmzActivityPlan> ActivityPlans => Set<TmzActivityPlan>();
    public DbSet<TmzActivityPlanStep> ActivityPlanSteps => Set<TmzActivityPlanStep>();
    public DbSet<TmzSrActivityPlan> SrActivityPlans => Set<TmzSrActivityPlan>();
    public DbSet<TmzActivity> Activities => Set<TmzActivity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TmzServiceRequest>(e =>
        {
            e.HasOne(s => s.Inspection)
                .WithOne(i => i.ServiceRequest)
                .HasForeignKey<TmzInspection>(i => i.SrNumber);

            e.HasOne(s => s.WorkOrder)
                .WithOne(w => w.ServiceRequest)
                .HasForeignKey<TmzWorkOrder>(w => w.SrNumber);
        });

        modelBuilder.Entity<TmzWorkOrder>(e =>
        {
            e.HasOne(w => w.Inspection)
                .WithOne(i => i.WorkOrder)
                .HasForeignKey<TmzWorkOrder>(w => w.InspectionId);
        });

        modelBuilder.Entity<TmzActivityPlanStep>(e =>
        {
            e.HasOne(s => s.Plan)
                .WithMany(p => p.Steps)
                .HasForeignKey(s => s.PlanId);
        });

        modelBuilder.Entity<TmzSrActivityPlan>(e =>
        {
            e.HasOne(p => p.ServiceRequest)
                .WithMany()
                .HasForeignKey(p => p.SrNumber);

            e.HasOne(p => p.Plan)
                .WithMany()
                .HasForeignKey(p => p.PlanId);
        });

        modelBuilder.Entity<TmzActivity>(e =>
        {
            e.HasOne(a => a.ServiceRequest)
                .WithMany()
                .HasForeignKey(a => a.SrNumber);

            e.HasOne(a => a.PlanStep)
                .WithMany()
                .HasForeignKey(a => a.PlanStepId)
                .IsRequired(false);
        });
    }
}
