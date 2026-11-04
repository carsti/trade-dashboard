package com.tradedashboard.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import com.tradedashboard.data.CurrencyTotal
import com.tradedashboard.data.SymbolBreakdown
import com.tradedashboard.ui.components.*
import com.tradedashboard.ui.theme.*
import kotlin.math.abs

private val WEEKDAY_LABELS = listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")

@Composable
fun AnalysisScreen(totals: List<CurrencyTotal>) {
    if (totals.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Background), contentAlignment = Alignment.Center) {
            Text("Keine Daten", color = OnSurfaceMuted)
        }
        return
    }

    var selectedCurrency by remember { mutableStateOf(totals.first().currency) }
    val total = totals.firstOrNull { it.currency == selectedCurrency } ?: totals.first()

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Currency selector
        if (totals.size > 1) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    totals.forEach { t ->
                        FilterChip(
                            selected = t.currency == selectedCurrency,
                            onClick = { selectedCurrency = t.currency },
                            label = { Text(t.currency) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Primary,
                                selectedLabelColor = OnBackground,
                                containerColor = SurfaceVariant,
                                labelColor = OnSurfaceMuted,
                            ),
                        )
                    }
                }
            }
        }

        // By symbol
        total.bySymbol?.let { symbols ->
            item {
                StatCard(modifier = Modifier.fillMaxWidth()) {
                    SectionHeader("Nach Symbol")
                    Spacer(Modifier.height(8.dp))
                    symbols.take(10).forEach { sym ->
                        SymbolRow(sym, selectedCurrency)
                        HorizontalDivider(color = SurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
                    }
                }
            }
        }

        // By weekday
        total.byWeekday?.let { weekdays ->
            item {
                StatCard(modifier = Modifier.fillMaxWidth()) {
                    SectionHeader("Nach Wochentag")
                    Spacer(Modifier.height(8.dp))
                    BarChart(
                        values = weekdays.map { it[0] },
                        labels = WEEKDAY_LABELS,
                        currency = selectedCurrency,
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                    )
                }
            }
        }

        // By hour
        total.byHour?.let { hours ->
            item {
                StatCard(modifier = Modifier.fillMaxWidth()) {
                    SectionHeader("Nach Uhrzeit (Serverzeit)")
                    Spacer(Modifier.height(8.dp))
                    BarChart(
                        values = hours.map { it[0] },
                        labels = (0..23).map { if (it % 4 == 0) "${it}h" else "" },
                        currency = selectedCurrency,
                        modifier = Modifier.fillMaxWidth().height(100.dp),
                    )
                }
            }
        }

        // Max drawdown + other stats
        item {
            StatCard(modifier = Modifier.fillMaxWidth()) {
                SectionHeader("Kennzahlen")
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    total.maxDrawdown?.let { dd ->
                        Column {
                            Text("Max. Drawdown", fontSize = 11.sp, color = OnSurfaceMuted)
                            Text("%.2f".format(dd), fontSize = 15.sp, color = Negative, fontWeight = FontWeight.Bold)
                        }
                    }
                    Column {
                        Text("Bots im Plus", fontSize = 11.sp, color = OnSurfaceMuted)
                        Text(total.botsProfit.toString(), fontSize = 15.sp, color = Positive, fontWeight = FontWeight.Bold)
                    }
                    Column {
                        Text("Bots im Minus", fontSize = 11.sp, color = OnSurfaceMuted)
                        Text(total.botsLoss.toString(), fontSize = 15.sp, color = Negative, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun SymbolRow(sym: SymbolBreakdown, currency: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(sym.symbol, fontSize = 13.sp, color = OnSurface, fontWeight = FontWeight.Medium)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${sym.trades} Trades", fontSize = 11.sp, color = OnSurfaceMuted)
            Text("${formatPct(sym.winRate)}", fontSize = 11.sp, color = OnSurfaceMuted)
            NetValueText(sym.net, currency)
        }
    }
}

@Composable
private fun BarChart(
    values: List<Double>,
    labels: List<String>,
    currency: String,
    modifier: Modifier = Modifier,
) {
    if (values.isEmpty()) return
    val maxAbs = values.maxOfOrNull { abs(it) }?.coerceAtLeast(1.0) ?: 1.0

    Column(modifier = modifier) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            val n = values.size
            val barWidth = (this.size.width / n) * 0.7f
            val gap = (this.size.width / n) * 0.3f
            val midY = this.size.height / 2

            // Zero line
            drawLine(SurfaceVariant, Offset(0f, midY), Offset(this.size.width, midY), strokeWidth = 1f)

            values.forEachIndexed { i, v ->
                val x = i * (barWidth + gap) + gap / 2
                val barH = (abs(v) / maxAbs * (this.size.height / 2 - 4)).toFloat()
                val color = if (v >= 0) Positive else Negative
                if (v >= 0) {
                    drawRect(color, topLeft = Offset(x, midY - barH), size = Size(barWidth, barH))
                } else {
                    drawRect(color, topLeft = Offset(x, midY), size = Size(barWidth, barH))
                }
            }
        }

        // Labels row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            labels.forEach { lbl ->
                Text(lbl, fontSize = 9.sp, color = OnSurfaceMuted, modifier = Modifier.weight(1f))
            }
        }
    }
}
