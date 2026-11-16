package com.tradedashboard.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradedashboard.data.BotStats
import com.tradedashboard.ui.components.*
import com.tradedashboard.ui.theme.*

@Composable
fun BotsScreen(
    bots: List<BotStats>,
    onRenameBot: (key: String, name: String) -> Unit,
) {
    var searchQuery by remember { mutableStateOf("") }

    val filteredBots = remember(bots, searchQuery) {
        if (searchQuery.isBlank()) bots
        else bots.filter {
            it.name.contains(searchQuery, ignoreCase = true) ||
            it.symbols.any { s -> s.contains(searchQuery, ignoreCase = true) } ||
            it.magics.any { m -> m.toString().contains(searchQuery) }
        }
    }

    // Group by account key
    val grouped = remember(filteredBots) {
        filteredBots.groupBy { it.accounts.firstOrNull() ?: "Unbekannt" }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Bot, Symbol, Magic suchen…", color = OnSurfaceMuted) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = SurfaceVariant,
                focusedTextColor = OnBackground,
                unfocusedTextColor = OnBackground,
                cursorColor = Primary,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )

        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            grouped.forEach { (account, accountBots) ->
                item {
                    Text(
                        text = account,
                        style = MaterialTheme.typography.titleMedium,
                        color = NeonCyan,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                }
                items(accountBots, key = { it.id }) { bot ->
                    BotCard(bot = bot, onRename = { key, name -> onRenameBot(key, name) })
                }
            }
        }
    }
}

@Composable
private fun BotCard(bot: BotStats, onRename: (key: String, name: String) -> Unit) {
    var showRenameDialog by remember { mutableStateOf(false) }

    StatCard(modifier = Modifier.fillMaxWidth()) {
        // Header row: name + actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        bot.name,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp,
                        color = OnBackground,
                    )
                    // Risk warning: grid/martingale pattern
                    val isRisky = bot.winRate != null && bot.winRate > 75 &&
                            bot.avgLoss != null && bot.avgWin != null &&
                            bot.avgLoss > bot.avgWin * 3
                    if (isRisky) {
                        Icon(Icons.Default.Warning, contentDescription = "Risiko", tint = Warning, modifier = Modifier.size(14.dp))
                    }
                }
                Text(
                    text = "Magic: ${bot.magics.joinToString(", ")}  ·  ${bot.symbols.take(3).joinToString(", ")}",
                    fontSize = 11.sp,
                    color = OnSurfaceMuted,
                )
            }
            IconButton(onClick = { showRenameDialog = true }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Edit, contentDescription = "Umbenennen", tint = OnSurfaceMuted, modifier = Modifier.size(16.dp))
            }
        }

        Spacer(Modifier.height(8.dp))

        // P&L + return
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NetValueText(bot.net, bot.currency, large = true)
            ReturnBadge(bot.returnPct)
            if (bot.floating != 0.0) {
                val prefix = if (bot.floating > 0) "+" else ""
                Text(
                    "Offen: $prefix${"%.2f".format(bot.floating)}",
                    fontSize = 12.sp,
                    color = if (bot.floating >= 0) Positive.copy(alpha = 0.8f) else Negative.copy(alpha = 0.8f),
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // Stats grid
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BotStatItem("Trades", bot.trades.toString())
            BotStatItem("Treffer", formatPct(bot.winRate))
            BotStatItem("PF", formatNum(bot.profitFactor))
            BotStatItem("Max DD", formatNum(bot.maxDrawdown))
        }

        // Mini curve
        if (bot.curve.size >= 2) {
            Spacer(Modifier.height(8.dp))
            MiniCurve(
                points = bot.curve,
                positive = bot.net >= 0,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
            )
        }

        // Inactive warning
        bot.lastTrade?.let { last ->
            val daysSince = (System.currentTimeMillis() / 1000 - last) / 86400
            if (daysSince > 7) {
                Spacer(Modifier.height(4.dp))
                Text("◷ Inaktiv seit $daysSince Tagen", fontSize = 11.sp, color = Warning)
            }
        }
    }

    if (showRenameDialog) {
        RenameDialog(
            currentName = bot.name,
            botId = bot.id,
            onConfirm = { key, name ->
                onRename(key, name)
                showRenameDialog = false
            },
            onDismiss = { showRenameDialog = false },
        )
    }
}

@Composable
private fun BotStatItem(label: String, value: String) {
    Column {
        Text(label, fontSize = 10.sp, color = OnSurfaceMuted)
        Text(value, fontSize = 13.sp, color = OnSurface, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun RenameDialog(
    currentName: String,
    botId: String,
    onConfirm: (key: String, name: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(currentName) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Surface,
        title = { Text("Bot umbenennen", color = OnBackground) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text("Name", color = OnSurfaceMuted) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onConfirm(botId, name) }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = SurfaceVariant,
                    focusedTextColor = OnBackground,
                    unfocusedTextColor = OnBackground,
                ),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(botId, name) }) {
                Text("Speichern", color = Primary)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Abbrechen", color = OnSurfaceMuted)
            }
        },
    )
}
