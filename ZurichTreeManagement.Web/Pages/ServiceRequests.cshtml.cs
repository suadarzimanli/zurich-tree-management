using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ZurichTreeManagement.Web.Pages;

public class ServiceRequestsModel : PageModel
{
    public bool IsAuthenticated { get; private set; }
    public string UserDisplayName { get; private set; } = "";
    public string LoginPath { get; private set; } = "/Account/Login";
    public string LogoutPath { get; private set; } = "/Account/Logout";
    public string Culture { get; private set; } = "en";
    public bool IsGerman => Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase);
    public string SrListPath { get; private set; } = "/api/sr";
    public string SrGetPath { get; private set; } = "/api/sr/{srNumber}";
    public string SrUpdatePath { get; private set; } = "/api/sr/{srNumber}";
    public string ActivitiesPath { get; private set; } = "/api/activities/sr/{srNumber}";
    public string ActivityUpdatePath { get; private set; } = "/api/activities/{activityId}";
    public string InspectionCreatePath { get; private set; } = "/api/inspection/create-for-sr/{srNumber}";
    public string InspectionUpdatePath { get; private set; } = "/api/inspection/{inspectionId}";
    public string WorkOrderUpdatePath { get; private set; } = "/api/workorder/{workOrderId}";

    public void OnGet()
    {
        IsAuthenticated = User?.Identity?.IsAuthenticated == true;
        UserDisplayName = User?.FindFirstValue(ClaimTypes.GivenName)
            ?? User?.Identity?.Name
            ?? "";

        Culture = Request.Cookies["ZurichCulture"] ?? "en";
        if (!Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase))
            Culture = "en";
    }
}
