package com.tradedashboard.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradedashboard.TimeRange
import com.tradedashboard.data.AccountStats
import com.tradedashboard.data.BotStats
import com.tradedashboard.data.CurrencyTotal
import com.tradedashboard.ui.components.*
import com.tradedashboard.ui.theme.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    totals: List<CurrencyTotal>,
    bots: List<BotStats>,
    accounts: List<AccountStats>,
    timeRange: TimeRange,
    onTimeRangeChange: (TimeRange) -> Unit,
    onRefresh: () -> Unit,
) {
    val timeRanges = listOf(
        TimeRange.Today, TimeRange.Days7, TimeRange.Days30,
        TimeRange.Days90, TimeRange.Year, TimeRange.All,
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Time range selector
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(timeRanges) { range ->
                    val selected = range == timeRange
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (selected) Primary else SurfaceVariant)
                            .clickable { onTimeRangeChange(range) }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = range.label,
                            color = if (selected) OnBackground else OnSurfaceMuted,
                            fontSize = 13.sp,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    }
                }
            }
        }

        // Currency totals
        items(totals) { total ->
            CurrencyTotalCard(total)
        }

        // Gauges row (win rate, bots in profit, etc.)
        item {
            if (totals.isNotEmpty()) {
                val t = totals.first()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    NeonGauge(
                        value = t.winRate ?: 0.0,
                        label = "Treffer",
                        color = NeonCyan,
                    )
                    val botsTotal = t.botsProfit + t.botsLoss
                    NeonGauge(
                        value = if (botsTotal > 0) t.botsProfit * 100.0 / botsTotal else 0.0,
                        label = "Bots +",
                        color = NeonGreen,
                    )
                    if (t.profitFactor != null) {
                        NeonGauge(
                            value = (t.profitFactor.coerceAtMost(5.0) / 5.0 * 100),
                            label = "PF ${formatNum(t.profitFactor)}",
                            suffix = "",
                            color = NeonPurple,
                        )
                    }
                }
            }
        }

        // Bot ranking (top 6)
        item {
            if (bots.isNotEmpty()) {
                StatCard {
                    SectionHeader("Bot-Ranking (Rendite)")
                    Spacer(Modifier.height(8.dp))
                    bots.sortedByDescending { it.returnPct ?: it.net }
                        .take(6)
                        .forEachIndexed { idx, bot ->
                            BotRankRow(idx + 1, bot)
                            if (idx < minOf(5, bots.size - 1)) {
                                HorizontalDivider(color = SurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
                            }
                        }
                }
            }
        }

        // Recent activity
        item {
            val recentBots = bots.filter { it.lastTrade != null }
                .sortedByDescending { it.lastTrade }
                .take(5)
            if (recentBots.isNotEmpty()) {
                StatCard {
                    SectionHeader("Letzte Aktivität")
                    Spacer(Modifier.height(8.dp))
                    recentBots.forEach { bot ->
                        ActivityRow(bot)
                    }
                }
            }
        }

        // Accounts summary
        item {
            if (accounts.isNotEmpty()) {
                StatCard {
                    SectionHeader("Konten")
                    Spacer(Modifier.height(8.dp))
                    accounts.forEach { acc ->
                        AccountRow(acc)
                        HorizontalDivider(color = SurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CurrencyTotalCard(total: CurrencyTotal) {
    StatCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = total.currency,
                    fontSize = 11.sp,
                    color = OnSurfaceMuted,
                    fontWeight = FontWeight.Medium,
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NetValueText(total.net, total.currency, large = true)
                    ReturnBadge(total.returnPct)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                total.balance?.let {
                    Text("Balance: ${"%.2f".format(it)}", color = OnSurfaceMuted, fontSize = 12.sp)
                }
                total.equity?.let {
                    Text("Equity: ${"%.2f".format(it)}", color = OnSurfaceMuted, fontSize = 12.sp)
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatChip("Trades", total.trades.toString())
            total.winRate?.let { StatChip("Treffer", "${"%.1f".format(it)}%") }
            total.profitFactor?.let { StatChip("PF", "%.2f".format(it)) }
            if (total.floating != 0.0) {
                StatChip("Offen", "%.2f".format(total.floating), if (total.floating >= 0) Positive else Negative)
            }
        }

        // Today / 7d / 30d summary
        val hasRecent = total.today != null || total.d7 != null || total.d30 != null
        if (hasRecent) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                total.today?.let { RecentChip("Heute", it, total.currency) }
                total.d7?.let { RecentChip("7 T", it, total.currency) }
                total.d30?.let { RecentChip("30 T", it, total.currency) }
            }
        }

        // Mini curve
        total.curve?.let { curve ->
            if (curve.size >= 2) {
                Spacer(Modifier.height(8.dp))
                val lastVal = curve.last()[1]
                MiniCurve(
                    points = curve,
                    positive = lastVal >= 0,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                )
            }
        }
    }
}

@Composable
private fun StatChip(label: String, value: String, color: androidx.compose.ui.graphics.Color = OnSurfaceMuted) {
    Column {
        Text(label, fontSize = 10.sp, color = OnSurfaceMuted)
        Text(value, fontSize = 13.sp, color = color, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun RecentChip(label: String, value: Double, currency: String) {
    val color = if (value >= 0) Positive else Negative
    val prefix = if (value > 0) "+" else ""
    Column {
        Text(label, fontSize = 10.sp, color = OnSurfaceMuted)
        Text("$prefix${"%.2f".format(value)}", fontSize = 12.sp, color = color, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun BotRankRow(rank: Int, bot: BotStats) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "#$rank",
                fontSize = 11.sp,
                color = when (rank) {
                    1 -> Warning
                    2 -> NeonCyan
                    3 -> NeonPurple
                    else -> OnSurfaceMuted
                },
                fontWeight = FontWeight.Bold,
            )
            Text(bot.name, fontSize = 13.sp, color = OnSurface)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            ReturnBadge(bot.returnPct)
            NetValueText(bot.net, bot.currency)
        }
    }
}

@Composable
private fun ActivityRow(bot: BotStats) {
    val lastTrade = bot.lastTrade
    val timeStr = lastTrade?.let {
        DateTimeFormatter.ofPattern("dd.MM HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(Instant.ofEpochSecond(it))
    } ?: "–"

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(bot.name, fontSize = 13.sp, color = OnSurface)
            Text(timeStr, fontSize = 11.sp, color = OnSurfaceMuted)
        }
        NetValueText(bot.net, bot.currency)
    }
}

@Composable
private fun AccountRow(acc: AccountStats) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(acc.label, fontSize = 13.sp, color = OnSurface, fontWeight = FontWeight.Medium)
            Text(acc.server, fontSize = 11.sp, color = OnSurfaceMuted)
        }
        Column(horizontalAlignment = Alignment.End) {
            NetValueText(acc.net, acc.currency)
            acc.balance?.let {
                Text("${"%.2f".format(it)} ${acc.currency}", fontSize = 11.sp, color = OnSurfaceMuted)
            }
        }
    }
    if (acc.error != null) {
        Text("⚠ ${acc.error}", fontSize = 11.sp, color = Negative)
    }
}
