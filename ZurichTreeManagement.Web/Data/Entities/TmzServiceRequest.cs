using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_ServiceRequest")]
public sealed class TmzServiceRequest
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long SrNumber { get; set; }

    [MaxLength(64)]
    public string Status { get; set; } = "In Progress";

    [MaxLength(128)]
    public string? SubStatus { get; set; }

    [MaxLength(32)]
    public string Priority { get; set; } = "Normal";

    [MaxLength(128)]
    public string Area { get; set; } = "Tree Maintenance";

    [MaxLength(128)]
    public string SubArea { get; set; } = "General Requests";

    [MaxLength(256)]
    public string RequestType { get; set; } = "";

    [MaxLength(64)]
    public string LinkedTreeBaumnummer { get; set; } = "";

    public int? OgdObjectId { get; set; }

    [MaxLength(256)]
    public string? OgdSpeciesGerman { get; set; }

    [MaxLength(256)]
    public string? OgdSpeciesLatin { get; set; }

    [MaxLength(128)]
    public string? OgdQuartier { get; set; }

    [MaxLength(256)]
    public string? OgdStreet { get; set; }

    public int? OgdPlantingYear { get; set; }

    [MaxLength(128)]
    public string? OgdCategory { get; set; }

    [MaxLength(128)]
    public string? OgdStatus { get; set; }

    [MaxLength(128)]
    public string ContactFirstName { get; set; } = "";

    [MaxLength(128)]
    public string ContactLastName { get; set; } = "";

    [MaxLength(256)]
    public string ContactEmail { get; set; } = "";

    [MaxLength(64)]
    public string? ContactPhone { get; set; }

    public string? Description { get; set; }

    [MaxLength(512)]
    public string? Address { get; set; }

    public double GisLatitude { get; set; }

    public double GisLongitude { get; set; }

    public DateTime OpenedDate { get; set; }

    public DateTime? ClosedDate { get; set; }

    [MaxLength(128)]
    public string? CreatedBy { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    [MaxLength(64)]
    public string Source { get; set; } = "Map App";

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public TmzInspection? Inspection { get; set; }

    public TmzWorkOrder? WorkOrder { get; set; }
}
