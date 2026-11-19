using System.ComponentModel.DataAnnotations;

namespace ZurichTreeManagement.Web.Models;

public sealed class UpdateWorkOrderRequest
{
    [Required]
    [MaxLength(64)]
    public string Status { get; set; } = "Resolved";

    [MaxLength(400)]
    public string? Contractor { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    [MaxLength(64)]
    public string? ProjectCode { get; set; }

    [MaxLength(4000)]
    public string? FieldComments { get; set; }

    [MaxLength(4000)]
    public string? InternalComment { get; set; }

    public DateTime? WorkDate { get; set; }
}
