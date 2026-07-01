"""
PDF report generation endpoint.
"""

import io
from datetime import datetime
from collections import Counter
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from services import supabase_service

router = APIRouter()


def _build_pdf_bytes() -> bytes:
    """Generate a Road Condition Report PDF and return as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=24,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=4 * mm,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        textColor=colors.HexColor("#64748b"),
        alignment=TA_CENTER,
        spaceAfter=8 * mm,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=6 * mm,
        spaceAfter=3 * mm,
    )
    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
    )
    stat_label = ParagraphStyle(
        "StatLabel",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#64748b"),
    )
    stat_value = ParagraphStyle(
        "StatValue",
        parent=styles["Normal"],
        fontSize=16,
        textColor=colors.HexColor("#0f172a"),
        leading=20,
    )

    # ── Data
    events = supabase_service.get_events()
    total = len(events)
    now = datetime.utcnow()

    type_counts = Counter()
    area_counts: dict[str, int] = {}
    severity_counts = Counter()

    for ev in events:
        etype = str(ev.get("event_type", "unknown")).lower()
        type_counts[etype] += 1
        sev = str(ev.get("severity", "LOW")).upper()
        severity_counts[sev] += 1

        try:
            e_lat = round(float(ev.get("lat", 0)), 3)
            e_lng = round(float(ev.get("lng", 0)), 3)
            key = f"{e_lat},{e_lng}"
            area_counts[key] = area_counts.get(key, 0) + 1
        except (TypeError, ValueError):
            pass

    # Top 5 most anomalous areas
    area_labels = {
        "12.845,77.586": "Silk Board Junction",
        "12.935,77.601": "MG Road",
        "12.957,77.723": "ORR (Outer Ring Road)",
        "12.839,77.679": "Electronic City",
        "12.930,77.631": "Koramangala",
        "12.970,77.684": "Whitefield – Marathahalli",
    }
    top_areas = sorted(area_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # ── Build story
    story = []

    # Header
    story.append(Paragraph("🛡️ UrbanGuard", title_style))
    story.append(Paragraph("Road Condition Report", subtitle_style))
    story.append(Paragraph(
        f"Generated: {now.strftime('%B %d, %Y at %H:%M UTC')}",
        ParagraphStyle("DateLine", parent=body_style, alignment=TA_CENTER, textColor=colors.HexColor("#94a3b8")),
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 4 * mm))

    # Summary stats table
    story.append(Paragraph("Overview", heading_style))
    summary_data = [
        ["Total Events", "Potholes", "Crashes", "Speed Breakers"],
        [
            str(total),
            str(type_counts.get("pothole", 0)),
            str(type_counts.get("crash", 0)),
            str(type_counts.get("speed_breaker", 0)),
        ],
    ]
    summary_table = Table(summary_data, colWidths=[40 * mm] * 4)
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#475569")),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 16),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#1e293b")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 4 * mm))

    # Severity breakdown
    story.append(Paragraph("Severity Breakdown", heading_style))
    sev_data = [
        ["HIGH", "MEDIUM", "LOW"],
        [
            str(severity_counts.get("HIGH", 0)),
            str(severity_counts.get("MEDIUM", 0)),
            str(severity_counts.get("LOW", 0)),
        ],
    ]
    sev_table = Table(sev_data, colWidths=[50 * mm] * 3)
    sev_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fef2f2")),
        ("TEXTCOLOR", (0, 0), (0, 0), colors.HexColor("#dc2626")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fffbeb")),
        ("TEXTCOLOR", (1, 0), (1, 0), colors.HexColor("#d97706")),
        ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#f0fdf4")),
        ("TEXTCOLOR", (2, 0), (2, 0), colors.HexColor("#16a34a")),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(sev_table)
    story.append(Spacer(1, 4 * mm))

    # Top 5 anomalous areas
    story.append(Paragraph("Top 5 Most Anomalous Locations", heading_style))
    area_table_data = [["#", "Location", "Events"]]
    for rank, (key, count) in enumerate(top_areas, 1):
        label = area_labels.get(key, f"({key})")
        area_table_data.append([str(rank), label, str(count)])

    if len(area_table_data) > 1:
        area_table = Table(area_table_data, colWidths=[12 * mm, 100 * mm, 30 * mm])
        area_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 1), (-1, -1), 10),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ]))
        story.append(area_table)
    else:
        story.append(Paragraph("No location data available.", body_style))

    story.append(Spacer(1, 6 * mm))

    # Recommendations
    story.append(Paragraph("Recommendations", heading_style))
    recs = [
        "Prioritize pothole repairs at Silk Board Junction and MG Road corridors.",
        "Install speed breakers at high-crash-frequency zones.",
        "Deploy real-time IoT vibration sensors on ORR and Electronic City stretches.",
        "Schedule periodic road resurfacing for segments with health scores below 40.",
        "Increase traffic signage near Koramangala and Whitefield high-risk intersections.",
    ]
    for rec in recs:
        story.append(Paragraph(f"• {rec}", body_style))
        story.append(Spacer(1, 1.5 * mm))

    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "This report was auto-generated by the UrbanGuard AI-Powered Smart Road Intelligence System.",
        ParagraphStyle("Footer", parent=body_style, fontSize=8, textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER),
    ))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


@router.get("/api/reports/road-condition")
def download_road_condition_report():
    """Generate and stream a Road Condition Report PDF."""
    pdf_bytes = _build_pdf_bytes()
    now_str = datetime.utcnow().strftime("%Y%m%d_%H%M")
    filename = f"UrbanGuard_Road_Report_{now_str}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
