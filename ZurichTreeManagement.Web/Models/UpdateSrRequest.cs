using System.ComponentModel.DataAnnotations;

namespace ZurichTreeManagement.Web.Models;

public sealed class UpdateSrRequest
{
    [MaxLength(64)]
    public string? Status { get; set; }

    [MaxLength(128)]
    public string? SubStatus { get; set; }

    [MaxLength(32)]
    public string? Priority { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    [MaxLength(4000)]
    public string? Description { get; set; }

    [MaxLength(512)]
    public string? Address { get; set; }

    [MaxLength(128)]
    public string? FirstName { get; set; }

    [MaxLength(128)]
    public string? LastName { get; set; }

    [MaxLength(256)]
    public string? Email { get; set; }

    [MaxLength(64)]
    public string? Phone { get; set; }
}
