using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ZurichTreeManagement.Web.Pages;

public class AboutModel : PageModel
{
  private readonly IConfiguration _configuration;

  public AboutModel(IConfiguration configuration) => _configuration = configuration;

  public string Culture { get; private set; } = "en";
  public bool IsGerman => Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase);
  public int MinTreeLayerZoom { get; private set; }
  public int MinSrZoom { get; private set; }
  public int MinTreeClickZoom { get; private set; }
  public int MapPickRadiusM { get; private set; }

  public void OnGet()
  {
    Culture = Request.Cookies["ZurichCulture"] ?? "en";
    if (!Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase))
      Culture = "en";

    MinTreeLayerZoom = _configuration.GetValue("Map:MinTreeLayerZoom", _configuration.GetValue("Map:MinTreeZoom", 13));
    MinTreeClickZoom = _configuration.GetValue("Map:MinTreeClickZoom", 19);
    MinSrZoom = _configuration.GetValue("Map:MinSrZoom", 19);
    MapPickRadiusM = _configuration.GetValue("Map:PickRadiusM", 10);
  }
}
