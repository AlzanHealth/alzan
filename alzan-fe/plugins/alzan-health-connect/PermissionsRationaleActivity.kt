package com.alzanhealth.app

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val backButton =
      TextView(this).apply {
        text = "<"
        textSize = 28f
        gravity = Gravity.CENTER
        contentDescription = "Back"
        setOnClickListener { finish() }
      }

    val titleView =
      TextView(this).apply {
        text = "Health Connect permissions"
        textSize = 20f
        gravity = Gravity.CENTER_VERTICAL
      }

    val cancelButton =
      TextView(this).apply {
        text = "Cancel"
        textSize = 16f
        gravity = Gravity.CENTER
        contentDescription = "Cancel"
        setOnClickListener { finish() }
      }

    val header =
      LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(24, 24, 24, 12)
        addView(backButton, LinearLayout.LayoutParams(56, 56))
        addView(titleView, LinearLayout.LayoutParams(0, 56, 1f))
        addView(cancelButton, LinearLayout.LayoutParams(120, 56))
      }

    val textView =
      TextView(this).apply {
        text =
          "Alzan reads Health Connect data only after your permission to import workouts, sleep, steps, heart rate, HRV, resting heart rate, and weight into your private health profile. Alzan does not write data to Health Connect."
        textSize = 16f
        gravity = Gravity.START
        setPadding(48, 48, 48, 48)
      }

    val content =
      ScrollView(this).apply {
        addView(
          textView,
          ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
          ),
        )
      }

    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(header, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      },
    )
  }
}
