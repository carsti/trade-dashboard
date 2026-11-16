package com.tradedashboard.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradedashboard.ui.theme.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun StatCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Surface)
            .border(1.dp, SurfaceVariant, RoundedCornerShape(12.dp))
            .padding(12.dp),
        content = content,
    )
}

@Composable
fun NetValueText(value: Double, currency: String, large: Boolean = false) {
    val color = when {
        value > 0 -> Positive
        value < 0 -> Negative
        else -> Neutral
    }
    val prefix = if (value > 0) "+" else ""
    Text(
        text = "$prefix${"%.2f".format(value)} $currency",
        color = color,
        fontSize = if (large) 20.sp else 15.sp,
        fontWeight = if (large) FontWeight.Bold else FontWeight.SemiBold,
    )
}

@Composable
fun ReturnBadge(pct: Double?) {
    if (pct == null) return
    val color = if (pct >= 0) Positive else Negative
    val prefix = if (pct >= 0) "+" else ""
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = "$prefix${"%.2f".format(pct)}%",
            color = color,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = OnSurfaceMuted,
        modifier = Modifier.padding(vertical = 4.dp),
    )
}

@Composable
fun NeonGauge(
    value: Double,
    label: String,
    suffix: String = "%",
    color: Color = NeonPurple,
    size: Dp = 90.dp,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(size),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = this.size.width * 0.1f
            val radius = (this.size.minDimension - strokeWidth) / 2
            val center = Offset(this.size.width / 2, this.size.height / 2)
            val startAngle = 135f
            val sweepMax = 270f

            // Track
            drawArc(
                color = SurfaceVariant,
                startAngle = startAngle,
                sweepAngle = sweepMax,
                useCenter = false,
                topLeft = Offset(center.x - radius, center.y - radius),
                size = Size(radius * 2, radius * 2),
                style = Stroke(strokeWidth, cap = StrokeCap.Round),
            )
            // Fill
            val sweep = (value.coerceIn(0.0, 100.0) / 100.0 * sweepMax).toFloat()
            if (sweep > 0) {
                drawArc(
                    color = color,
                    startAngle = startAngle,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(strokeWidth, cap = StrokeCap.Round),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "${"%.0f".format(value)}$suffix",
                fontSize = (size.value * 0.17).sp,
                fontWeight = FontWeight.Bold,
                color = OnBackground,
            )
            Text(
                text = label,
                fontSize = (size.size * 0.11f).sp,
                color = OnSurfaceMuted,
            )
        }
    }
}

@Composable
fun MiniCurve(
    points: List<List<Double>>,
    positive: Boolean = true,
    modifier: Modifier = Modifier,
) {
    if (points.size < 2) return
    val lineColor = if (positive) Positive else Negative
    Canvas(modifier = modifier) {
        val minY = points.minOf { it[1] }
        val maxY = points.maxOf { it[1] }
        val minX = points.minOf { it[0] }
        val maxX = points.maxOf { it[0] }
        val rangeY = (maxY - minY).coerceAtLeast(1.0)
        val rangeX = (maxX - minX).coerceAtLeast(1.0)

        val path = androidx.compose.ui.graphics.Path()
        points.forEachIndexed { i, pt ->
            val x = ((pt[0] - minX) / rangeX * this.size.width).toFloat()
            val y = (this.size.height - (pt[1] - minY) / rangeY * this.size.height).toFloat()
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, lineColor, style = Stroke(2f, cap = StrokeCap.Round))
    }
}

fun formatPct(value: Double?): String = if (value == null) "–" else "${"%.1f".format(value)}%"
fun formatNum(value: Double?): String = if (value == null) "–" else "%.2f".format(value)
fun formatInt(value: Int): String = value.toString()
