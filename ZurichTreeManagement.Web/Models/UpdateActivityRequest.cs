using System.ComponentModel.DataAnnotations;

namespace ZurichTreeManagement.Web.Models;

public sealed class UpdateActivityRequest
{
    [MaxLength(32)]
    public string? Status { get; set; }

    [MaxLength(256)]
    public string? Subject { get; set; }

    [MaxLength(4000)]
    public string? Notes { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    public DateTime? DueDate { get; set; }
}
