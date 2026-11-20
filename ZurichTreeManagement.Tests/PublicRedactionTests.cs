using System.Security.Claims;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Tests;

public class PublicRedactionTests
{
    private static ClaimsPrincipal Anonymous => new(new ClaimsIdentity());
    private static ClaimsPrincipal Staff => new(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "admin") }, "cookie"));

    private static SrDetailDto Sample() => new()
    {
        SrNumber = 10001,
        FirstName = "Anna",
        LastName = "Muster",
        Email = "anna@example.ch",
        Phone = "+41 44 000 00 00",
        Inspection = new InspectionDto { InternalComment = "check root plate" },
        WorkOrder = new WorkOrderDto { InternalComment = "crew B" }
    };

    [Fact]
    public void Anonymous_viewer_never_sees_who_filed_or_staff_notes()
    {
        var sr = PublicRedaction.Apply(Sample(), Anonymous);
        Assert.Equal("", sr.FirstName);
        Assert.Equal("", sr.LastName);
        Assert.Equal("", sr.Email);
        Assert.Null(sr.Phone);
        Assert.True(sr.ContactRedacted);
        Assert.Null(sr.Inspection!.InternalComment);
        Assert.Null(sr.WorkOrder!.InternalComment);
    }

    [Fact]
    public void Signed_in_staff_see_everything()
    {
        var sr = PublicRedaction.Apply(Sample(), Staff);
        Assert.Equal("anna@example.ch", sr.Email);
        Assert.False(sr.ContactRedacted);
        Assert.Equal("crew B", sr.WorkOrder!.InternalComment);
    }

    [Fact]
    public void List_hides_contact_names_for_anonymous()
    {
        var list = new SrListResponse { Items = new[] { new SrListItemDto { ContactName = "Anna Muster" } }, Total = 1 };
        PublicRedaction.Apply(list, Anonymous);
        Assert.Equal("", list.Items[0].ContactName);
        Assert.True(list.Items[0].ContactRedacted);
    }

    [Fact]
    public void Activity_notes_are_staff_only()
    {
        var acts = new List<ActivityDto> { new() { Notes = "call resident" } };
        PublicRedaction.Apply(acts, Anonymous);
        Assert.Null(acts[0].Notes);
    }
}
