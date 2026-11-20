using System.ComponentModel.DataAnnotations;

namespace ZurichTreeManagement.Web.Models;

public sealed class CreateSrRequest
{
    [Required]
    public double Lat { get; set; }

    [Required]
    public double Lng { get; set; }

    [MaxLength(512)]
    public string Address { get; set; } = "";

    [Required]
    [MaxLength(128)]
    public string FirstName { get; set; } = "";

    [Required]
    [MaxLength(128)]
    public string LastName { get; set; } = "";

    [Required]
    [EmailAddress]
    [MaxLength(256)]
    public string Email { get; set; } = "";

    [MaxLength(64)]
    public string? Phone { get; set; }

    [Required]
    [MaxLength(256)]
    public string RequestType { get; set; } = "";

    [MaxLength(4000)]
    public string? Description { get; set; }

    [Required]
    [MaxLength(64)]
    public string LinkedTreeBaumnummer { get; set; } = "";

    [MaxLength(256)]
    public string? OgdSpeciesGerman { get; set; }

    [MaxLength(128)]
    public string? OgdQuartier { get; set; }

    [MaxLength(256)]
    public string? OgdStreet { get; set; }

    public int? OgdObjectId { get; set; }

    [MaxLength(256)]
    public string? OgdSpeciesLatin { get; set; }

    public int? OgdPlantingYear { get; set; }

    [MaxLength(128)]
    public string? OgdCategory { get; set; }

    [MaxLength(128)]
    public string? OgdStatus { get; set; }
}
