using System.Security.Claims;
using ZurichTreeManagement.Web.Models;

namespace ZurichTreeManagement.Web.Services;

/// <summary>
/// Privacy by design: anonymous visitors may follow a request's progress, but
/// never see who filed it (name, e-mail, phone) or staff-internal notes. Only
/// signed-in staff receive those fields. Applied at the API boundary so every
/// endpoint that returns case data goes through the same rule.
/// </summary>
public static class PublicRedaction
{
    public static bool IsStaff(ClaimsPrincipal? user) => user?.Identity?.IsAuthenticated == true;

    public static SrDetailDto Apply(SrDetailDto sr, ClaimsPrincipal? user)
    {
        if (IsStaff(user)) return sr;
        sr.FirstName = "";
        sr.LastName = "";
        sr.Email = "";
        sr.Phone = null;
        sr.ContactRedacted = true;
        if (sr.Inspection is not null) Apply(sr.Inspection, user);
        if (sr.WorkOrder is not null) Apply(sr.WorkOrder, user);
        return sr;
    }

    public static SrListResponse Apply(SrListResponse list, ClaimsPrincipal? user)
    {
        if (IsStaff(user)) return list;
        foreach (var item in list.Items)
        {
            item.ContactName = "";
            item.ContactRedacted = true;
        }
        return list;
    }

    public static InspectionDto Apply(InspectionDto i, ClaimsPrincipal? user)
    {
        if (!IsStaff(user)) i.InternalComment = null;
        return i;
    }

    public static WorkOrderDto Apply(WorkOrderDto w, ClaimsPrincipal? user)
    {
        if (!IsStaff(user)) w.InternalComment = null;
        return w;
    }

    public static IReadOnlyList<ActivityDto> Apply(IReadOnlyList<ActivityDto> list, ClaimsPrincipal? user)
    {
        if (IsStaff(user)) return list;
        foreach (var a in list) a.Notes = null;
        return list;
    }
}
