package com.tradedashboard

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tradedashboard.data.DashboardRepository
import com.tradedashboard.data.ReportResponse
import com.tradedashboard.data.StateResponse
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

private val KEY_BASE_URL = stringPreferencesKey("base_url")
private val KEY_TOKEN = stringPreferencesKey("token")

sealed class TimeRange(val label: String) {
    data object Today : TimeRange("Heute")
    data object Days7 : TimeRange("7 Tage")
    data object Days30 : TimeRange("30 Tage")
    data object Days90 : TimeRange("90 Tage")
    data object Year : TimeRange("Jahr")
    data object All : TimeRange("Gesamt")
}

sealed class UiState {
    data object NotConnected : UiState()
    data object Loading : UiState()
    data class Error(val message: String) : UiState()
    data class Success(val state: StateResponse, val report: ReportResponse) : UiState()
}

class DashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow<UiState>(UiState.NotConnected)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _timeRange = MutableStateFlow<TimeRange>(TimeRange.Days30)
    val timeRange: StateFlow<TimeRange> = _timeRange.asStateFlow()

    private val _groupByBot = MutableStateFlow(false)
    val groupByBot: StateFlow<Boolean> = _groupByBot.asStateFlow()

    private val _selectedAccounts = MutableStateFlow<Set<String>?>(null)
    val selectedAccounts: StateFlow<Set<String>?> = _selectedAccounts.asStateFlow()

    var savedBaseUrl: String = ""
    var savedToken: String = ""

    private var repository: DashboardRepository? = null
    private var refreshJob: Job? = null

    init {
        viewModelScope.launch {
            val prefs = application.dataStore.data.first()
            savedBaseUrl = prefs[KEY_BASE_URL] ?: ""
            savedToken = prefs[KEY_TOKEN] ?: ""
            if (savedBaseUrl.isNotEmpty() && savedToken.isNotEmpty()) {
                connect(savedBaseUrl, savedToken)
            }
        }
    }

    fun connect(baseUrl: String, token: String) {
        viewModelScope.launch {
            getApplication<Application>().dataStore.edit { prefs ->
                prefs[KEY_BASE_URL] = baseUrl
                prefs[KEY_TOKEN] = token
            }
            savedBaseUrl = baseUrl
            savedToken = token
            repository = DashboardRepository(baseUrl, token)
            loadData()
            startAutoRefresh()
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            refreshJob?.cancel()
            repository = null
            _uiState.value = UiState.NotConnected
            getApplication<Application>().dataStore.edit { it.clear() }
            savedBaseUrl = ""
            savedToken = ""
        }
    }

    fun setTimeRange(range: TimeRange) {
        _timeRange.value = range
        loadData()
    }

    fun setGroupByBot(byBot: Boolean) {
        _groupByBot.value = byBot
        loadData()
    }

    fun toggleAccountFilter(key: String) {
        val current = _selectedAccounts.value?.toMutableSet() ?: mutableSetOf()
        if (current.contains(key)) current.remove(key) else current.add(key)
        _selectedAccounts.value = if (current.isEmpty()) null else current
        loadData()
    }

    fun clearAccountFilter() {
        _selectedAccounts.value = null
        loadData()
    }

    fun refresh() {
        viewModelScope.launch {
            repository?.triggerRefresh()
            loadData()
        }
    }

    fun renamBot(key: String, name: String) {
        viewModelScope.launch {
            repository?.setBotName(key, name)
            loadData()
        }
    }

    fun toggleDemo() {
        val current = (_uiState.value as? UiState.Success)?.state?.demo ?: return
        viewModelScope.launch {
            repository?.setMode(!current)
            loadData()
        }
    }

    private fun loadData() {
        val repo = repository ?: return
        viewModelScope.launch {
            if (_uiState.value !is UiState.Success) {
                _uiState.value = UiState.Loading
            }
            val (from, to) = timeRangeToUnix(_timeRange.value)
            val group = if (_groupByBot.value) "bot" else "account"
            val accs = _selectedAccounts.value

            val stateResult = repo.getState()
            val reportResult = repo.getReport(from, to, group, accs)

            if (stateResult.isFailure || reportResult.isFailure) {
                val err = (stateResult.exceptionOrNull() ?: reportResult.exceptionOrNull())?.message ?: "Unbekannter Fehler"
                _uiState.value = UiState.Error(err)
            } else {
                _uiState.value = UiState.Success(stateResult.getOrThrow(), reportResult.getOrThrow())
            }
        }
    }

    private fun startAutoRefresh() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            while (true) {
                val seconds = (_uiState.value as? UiState.Success)?.state?.settings?.refreshSeconds ?: 60
                delay(seconds * 1000L)
                loadData()
            }
        }
    }

    private fun timeRangeToUnix(range: TimeRange): Pair<Long?, Long?> {
        val now = Instant.now().epochSecond
        val today = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toEpochSecond()
        return when (range) {
            TimeRange.Today -> today to null
            TimeRange.Days7 -> (today - 6 * 86400) to null
            TimeRange.Days30 -> (today - 29 * 86400) to null
            TimeRange.Days90 -> (today - 89 * 86400) to null
            TimeRange.Year -> {
                val year = LocalDate.now().year
                val start = LocalDate.of(year, 1, 1).atStartOfDay(ZoneOffset.UTC).toEpochSecond()
                start to null
            }
            TimeRange.All -> null to null
        }
    }

    override fun onCleared() {
        super.onCleared()
        refreshJob?.cancel()
    }
}
