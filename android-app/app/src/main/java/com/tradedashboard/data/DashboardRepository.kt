package com.tradedashboard.data

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class DashboardRepository(baseUrl: String, private val token: String) {

    private val api: DashboardApi

    init {
        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .addHeader("X-Token", token)
                    .build()
                chain.proceed(request)
            }
            .addInterceptor(logger)
            .build()

        api = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(DashboardApi::class.java)
    }

    suspend fun getState(): Result<StateResponse> = runCatching {
        api.getState().let { r ->
            if (r.isSuccessful) r.body()!! else error("HTTP ${r.code()}: ${r.message()}")
        }
    }

    suspend fun getReport(
        from: Long? = null,
        to: Long? = null,
        group: String = "account",
        accounts: Set<String>? = null,
    ): Result<ReportResponse> = runCatching {
        api.getReport(from, to, group, accounts?.joinToString(",")).let { r ->
            if (r.isSuccessful) r.body()!! else error("HTTP ${r.code()}: ${r.message()}")
        }
    }

    suspend fun triggerRefresh(): Result<Unit> = runCatching {
        api.triggerRefresh()
        Unit
    }

    suspend fun setMode(demo: Boolean): Result<Unit> = runCatching {
        api.setMode(mapOf("demo" to demo))
        Unit
    }

    suspend fun setBotName(key: String, name: String): Result<Unit> = runCatching {
        api.setBotName(mapOf("key" to key, "name" to name))
        Unit
    }

    companion object {
        fun parseTokenFromUrl(url: String): Pair<String, String>? {
            // Handles URLs like http://host:8765/?token=xxx#/path
            return try {
                val uri = java.net.URI(url)
                val query = uri.query ?: ""
                val token = query.split("&")
                    .firstOrNull { it.startsWith("token=") }
                    ?.removePrefix("token=") ?: ""
                val baseUrl = "${uri.scheme}://${uri.host}:${if (uri.port > 0) uri.port else 8765}/"
                if (token.isNotEmpty()) baseUrl to token else null
            } catch (_: Exception) {
                null
            }
        }
    }
}
