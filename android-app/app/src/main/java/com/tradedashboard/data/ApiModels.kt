package com.tradedashboard.data

import com.google.gson.annotations.SerializedName

data class StateResponse(
    val demo: Boolean,
    @SerializedName("mt5_available") val mt5Available: Boolean,
    val accounts: List<AccountInfo>,
    val settings: Settings,
    @SerializedName("bot_names") val botNames: Map<String, String>,
    val refreshing: Boolean,
    @SerializedName("last_refresh") val lastRefresh: Long?,
    val remote: Boolean,
)

data class AccountInfo(
    val id: String,
    val label: String,
    val login: Long,
    val server: String,
    val enabled: Boolean,
    @SerializedName("allow_switch") val allowSwitch: Boolean,
)

data class Settings(
    @SerializedName("refresh_seconds") val refreshSeconds: Int,
    @SerializedName("history_days") val historyDays: Int,
    @SerializedName("default_terminal_path") val defaultTerminalPath: String,
)

data class ReportResponse(
    val bots: List<BotStats>,
    val accounts: List<AccountStats>,
    val totals: List<CurrencyTotal>,
)

data class BotStats(
    val id: String,
    val name: String,
    val currency: String,
    val accounts: List<String>,
    @SerializedName("account_keys") val accountKeys: List<String>,
    val magics: List<Int>,
    val trades: Int,
    val wins: Int,
    val losses: Int,
    @SerializedName("win_rate") val winRate: Double?,
    @SerializedName("gross_profit") val grossProfit: Double,
    @SerializedName("gross_loss") val grossLoss: Double,
    val net: Double,
    @SerializedName("avg_win") val avgWin: Double?,
    @SerializedName("avg_loss") val avgLoss: Double?,
    val costs: Double,
    @SerializedName("profit_factor") val profitFactor: Double?,
    @SerializedName("avg_trade") val avgTrade: Double?,
    val best: Double?,
    val worst: Double?,
    @SerializedName("max_drawdown") val maxDrawdown: Double,
    val volume: Double,
    val symbols: List<String>,
    @SerializedName("last_trade") val lastTrade: Long?,
    @SerializedName("return_pct") val returnPct: Double?,
    val floating: Double,
    @SerializedName("open_count") val openCount: Int,
    val result: Double,
    val curve: List<List<Double>>,
)

data class AccountStats(
    val key: String,
    val label: String,
    val login: Long,
    val server: String,
    val currency: String,
    val balance: Double?,
    val equity: Double?,
    @SerializedName("margin_level") val marginLevel: Double?,
    val leverage: Int?,
    val status: String,
    val error: String?,
    val updated: Long?,
    val net: Double,
    @SerializedName("return_pct") val returnPct: Double?,
    val floating: Double,
    @SerializedName("open_count") val openCount: Int,
    val trades: Int,
    val selected: Boolean,
)

data class CurrencyTotal(
    val currency: String,
    val net: Double,
    val floating: Double,
    val trades: Int,
    val wins: Int,
    @SerializedName("gross_profit") val grossProfit: Double,
    @SerializedName("gross_loss") val grossLoss: Double,
    @SerializedName("bots_profit") val botsProfit: Int,
    @SerializedName("bots_loss") val botsLoss: Int,
    @SerializedName("win_rate") val winRate: Double?,
    @SerializedName("profit_factor") val profitFactor: Double?,
    val balance: Double?,
    val equity: Double?,
    @SerializedName("return_pct") val returnPct: Double?,
    @SerializedName("open_count") val openCount: Int?,
    val today: Double?,
    val d7: Double?,
    val d30: Double?,
    val daily: List<List<Double>>?,
    val curve: List<List<Double>>?,
    @SerializedName("max_drawdown") val maxDrawdown: Double?,
    @SerializedName("by_symbol") val bySymbol: List<SymbolBreakdown>?,
    @SerializedName("by_weekday") val byWeekday: List<List<Double>>?,
    @SerializedName("by_hour") val byHour: List<List<Double>>?,
)

data class SymbolBreakdown(
    val symbol: String,
    val net: Double,
    val trades: Int,
    @SerializedName("win_rate") val winRate: Double,
)
