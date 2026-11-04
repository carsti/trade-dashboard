package com.tradedashboard.data

import retrofit2.Response
import retrofit2.http.*

interface DashboardApi {

    @GET("api/state")
    suspend fun getState(): Response<StateResponse>

    @GET("api/report")
    suspend fun getReport(
        @Query("from") from: Long? = null,
        @Query("to") to: Long? = null,
        @Query("group") group: String = "account",
        @Query("accounts") accounts: String? = null,
    ): Response<ReportResponse>

    @POST("api/refresh")
    suspend fun triggerRefresh(): Response<Map<String, Any>>

    @POST("api/mode")
    suspend fun setMode(@Body body: Map<String, Boolean>): Response<Map<String, Any>>

    @POST("api/bot-name")
    suspend fun setBotName(@Body body: Map<String, String>): Response<Map<String, Any>>
}
