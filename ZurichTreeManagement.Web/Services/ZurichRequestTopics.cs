namespace ZurichTreeManagement.Web.Services;

/// <summary>
/// Maps Stadt Zürich request types to workflow Area / Sub-Area (legacy KBA categories).
/// </summary>
public static class ZurichRequestTopics
{
    private static readonly IReadOnlyDictionary<string, string> RequestTypeToSubArea =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Tree inspection or pruning request"] = "Pruning Requests",
            ["Tree planting request"] = "Tree Planting Requests",
            ["Stump removal request"] = "Stump Removal Requests",
            ["General tree information"] = "General Information",
            ["Fallen tree — road blocked (emergency)"] = "Other",
            ["Fallen tree — not blocking road"] = "Other",
            ["Broken or hanging branch"] = "Other",
            ["Bee nest in tree"] = "Other",
            ["Sight line / visibility obstruction"] = "Other"
        };

    private static readonly HashSet<string> UrgentRequestTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Fallen tree — road blocked (emergency)",
        "Broken or hanging branch"
    };

    public static string ResolveSubArea(string? requestType)
    {
        var key = (requestType ?? "").Trim();
        if (string.IsNullOrEmpty(key)) return "Other";
        return RequestTypeToSubArea.TryGetValue(key, out var subArea) ? subArea : "Other";
    }

    public static string ResolveArea(string? requestType) => "Tree Maintenance";

    public static string ResolvePriority(string? requestType)
    {
        var key = (requestType ?? "").Trim();
        return !string.IsNullOrEmpty(key) && UrgentRequestTypes.Contains(key) ? "Urgent" : "Normal";
    }
}
