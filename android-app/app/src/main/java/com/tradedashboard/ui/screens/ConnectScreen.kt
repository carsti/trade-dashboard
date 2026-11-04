package com.tradedashboard.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradedashboard.DashboardViewModel
import com.tradedashboard.data.DashboardRepository
import com.tradedashboard.ui.theme.*

@Composable
fun ConnectScreen(viewModel: DashboardViewModel) {
    var urlInput by remember { mutableStateOf("") }
    var tokenInput by remember { mutableStateOf("") }
    var showToken by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Logo / Title
        Icon(
            imageVector = Icons.Default.Link,
            contentDescription = null,
            tint = Primary,
            modifier = Modifier.size(56.dp),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Trade Dashboard",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = OnBackground,
        )
        Text(
            text = "MT5 Bot Dashboard verbinden",
            fontSize = 14.sp,
            color = OnSurfaceMuted,
            modifier = Modifier.padding(top = 4.dp, bottom = 32.dp),
        )

        // URL field (can paste full URL with token)
        OutlinedTextField(
            value = urlInput,
            onValueChange = {
                urlInput = it
                errorText = ""
                // Auto-parse token from pasted URL
                DashboardRepository.parseTokenFromUrl(it)?.let { (_, tok) ->
                    tokenInput = tok
                }
            },
            label = { Text("Server-URL", color = OnSurfaceMuted) },
            placeholder = { Text("http://192.168.1.20:8765/", color = OnSurfaceMuted) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = SurfaceVariant,
                focusedTextColor = OnBackground,
                unfocusedTextColor = OnBackground,
                cursorColor = Primary,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        // Token field
        OutlinedTextField(
            value = tokenInput,
            onValueChange = { tokenInput = it; errorText = "" },
            label = { Text("Token", color = OnSurfaceMuted) },
            placeholder = { Text("Aus der Dashboard-URL", color = OnSurfaceMuted) },
            singleLine = true,
            visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showToken = !showToken }) {
                    Icon(
                        if (showToken) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = null,
                        tint = OnSurfaceMuted,
                    )
                }
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = SurfaceVariant,
                focusedTextColor = OnBackground,
                unfocusedTextColor = OnBackground,
                cursorColor = Primary,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        if (errorText.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(errorText, color = Negative, fontSize = 13.sp)
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                val parsed = DashboardRepository.parseTokenFromUrl(urlInput)
                val baseUrl = parsed?.first ?: run {
                    val raw = urlInput.trim().trimEnd('/')
                    if (!raw.startsWith("http")) {
                        errorText = "URL muss mit http:// beginnen"
                        return@Button
                    }
                    "$raw/"
                }
                val token = tokenInput.trim().ifEmpty { parsed?.second ?: "" }
                if (token.isEmpty()) {
                    errorText = "Token wird benötigt"
                    return@Button
                }
                viewModel.connect(baseUrl, token)
            },
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
        ) {
            Text("Verbinden", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.height(24.dp))

        Card(
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceVariant),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text("Wie verbinden?", fontWeight = FontWeight.SemiBold, color = OnSurface, fontSize = 13.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    "1. MT5-Bot-Dashboard.exe auf dem PC starten\n" +
                    "2. Die Adresse aus dem Konsolenfenster kopieren (z. B. http://192.168.1.20:8765/)\n" +
                    "3. Die vollständige Browser-URL mit ?token=... hier einfügen",
                    color = OnSurfaceMuted,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            }
        }
    }
}
