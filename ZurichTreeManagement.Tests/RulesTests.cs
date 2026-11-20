using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Tests;

public class RulesTests
{
    [Theory]
    [InlineData(47.3769, 8.5417, true)]   // Zürich HB
    [InlineData(47.4097, 8.5446, true)]   // Oerlikon
    [InlineData(46.9480, 7.4474, false)]  // Bern
    [InlineData(0, 0, false)]
    [InlineData(double.NaN, 8.54, false)]
    public void Only_locations_in_Zurich_are_accepted(double lat, double lng, bool expected) =>
        Assert.Equal(expected, ZurichArea.Contains(lat, lng));

    [Fact]
    public void Request_types_come_from_the_allow_list()
    {
        Assert.True(ZurichRequestTopics.IsKnown("Tree planting request"));
        Assert.True(ZurichRequestTopics.IsKnown("  tree planting request "));
        Assert.False(ZurichRequestTopics.IsKnown("<script>alert(1)</script>"));
        Assert.False(ZurichRequestTopics.IsKnown(""));
    }

    [Fact]
    public void Emergencies_are_urgent()
    {
        Assert.Equal("Urgent", ZurichRequestTopics.ResolvePriority("Fallen tree — road blocked (emergency)"));
        Assert.Equal("Normal", ZurichRequestTopics.ResolvePriority("Tree planting request"));
    }
}
