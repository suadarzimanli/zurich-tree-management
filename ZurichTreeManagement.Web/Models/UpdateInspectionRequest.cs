using System.ComponentModel.DataAnnotations;

namespace ZurichTreeManagement.Web.Models;

public sealed class UpdateInspectionRequest
{
    [Required]
    [MaxLength(64)]
    public string Status { get; set; } = "Created";

    public DateTime? InspectDate { get; set; }

    [MaxLength(128)]
    public string? Inspector { get; set; }

    [MaxLength(64)]
    public string? Findings { get; set; }

    [MaxLength(32)]
    public string? Priority { get; set; }

    public bool? EHAP { get; set; }

    [MaxLength(4000)]
    public string? Comment { get; set; }

    [MaxLength(4000)]
    public string? InternalComment { get; set; }

    [MaxLength(100)]
    public string? WorkOrderType { get; set; }
}
