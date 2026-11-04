package com.tradedashboard

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.tradedashboard.ui.screens.*
import com.tradedashboard.ui.theme.*

sealed class Screen(val route: String, val label: String) {
    data object Dashboard : Screen("dashboard", "Dashboard")
    data object Bots : Screen("bots", "Bots")
    data object Analysis : Screen("analysis", "Analyse")
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TradeDashboardTheme {
                TradeDashboardApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TradeDashboardApp() {
    val viewModel: DashboardViewModel = viewModel()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val timeRange by viewModel.timeRange.collectAsStateWithLifecycle()
    val groupByBot by viewModel.groupByBot.collectAsStateWithLifecycle()

    when (val state = uiState) {
        is UiState.NotConnected -> ConnectScreen(viewModel)
        is UiState.Loading -> LoadingScreen()
        is UiState.Error -> ErrorScreen(state.message) { viewModel.refresh() }
        is UiState.Success -> {
            val navController = rememberNavController()
            val screens = listOf(Screen.Dashboard, Screen.Bots, Screen.Analysis)

            Scaffold(
                containerColor = Background,
                topBar = {
                    TopAppBar(
                        title = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Trade Dashboard",
                                    color = OnBackground,
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                if (state.state.demo) {
                                    Spacer(Modifier.width(8.dp))
                                    DemoBadge()
                                }
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Surface),
                        actions = {
                            if (state.state.refreshing) {
                                CircularProgressIndicator(
                                    color = Primary,
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            IconButton(onClick = { viewModel.refresh() }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Aktualisieren", tint = OnSurface)
                            }
                            IconButton(onClick = { viewModel.toggleDemo() }) {
                                Icon(
                                    if (state.state.demo) Icons.Default.CloudOff else Icons.Default.Cloud,
                                    contentDescription = "Demo umschalten",
                                    tint = if (state.state.demo) Warning else OnSurfaceMuted,
                                )
                            }
                            IconButton(onClick = { viewModel.disconnect() }) {
                                Icon(Icons.Default.LinkOff, contentDescription = "Trennen", tint = OnSurfaceMuted)
                            }
                        },
                    )
                },
                bottomBar = {
                    NavigationBar(containerColor = Surface) {
                        val navBackStackEntry by navController.currentBackStackEntryAsState()
                        val currentDestination = navBackStackEntry?.destination
                        screens.forEach { screen ->
                            NavigationBarItem(
                                selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                                onClick = {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = {
                                    Icon(
                                        imageVector = when (screen) {
                                            Screen.Dashboard -> Icons.Default.Dashboard
                                            Screen.Bots -> Icons.Default.SmartToy
                                            Screen.Analysis -> Icons.Default.BarChart
                                        },
                                        contentDescription = screen.label,
                                    )
                                },
                                label = { Text(screen.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Primary,
                                    selectedTextColor = Primary,
                                    indicatorColor = Primary.copy(alpha = 0.15f),
                                    unselectedIconColor = OnSurfaceMuted,
                                    unselectedTextColor = OnSurfaceMuted,
                                ),
                            )
                        }
                    }
                },
            ) { innerPadding ->
                NavHost(
                    navController = navController,
                    startDestination = Screen.Dashboard.route,
                    modifier = Modifier.padding(innerPadding),
                ) {
                    composable(Screen.Dashboard.route) {
                        DashboardScreen(
                            totals = state.report.totals,
                            bots = state.report.bots,
                            accounts = state.report.accounts,
                            timeRange = timeRange,
                            onTimeRangeChange = viewModel::setTimeRange,
                            onRefresh = viewModel::refresh,
                        )
                    }
                    composable(Screen.Bots.route) {
                        BotsScreen(
                            bots = state.report.bots,
                            onRenameBot = viewModel::renamBot,
                        )
                    }
                    composable(Screen.Analysis.route) {
                        AnalysisScreen(totals = state.report.totals)
                    }
                }
            }
        }
    }
}

@Composable
private fun DemoBadge() {
    Box(
        modifier = Modifier
            .background(Warning.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text("DEMO", color = Warning, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier.fillMaxSize().background(Background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = Primary)
            Spacer(Modifier.height(16.dp))
            Text("Verbinde…", color = OnSurfaceMuted)
        }
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().background(Background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(24.dp),
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = Negative, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(12.dp))
            Text("Verbindungsfehler", color = OnBackground, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text(message, color = OnSurfaceMuted, fontSize = 13.sp)
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
            ) {
                Text("Erneut versuchen")
            }
        }
    }
}

