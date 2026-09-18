import React from 'react'
import Plot from 'react-plotly.js'
import { plotTheme } from '../../settings/settings'

const COLORS = {
    ROQS: "#636EFA",
    Watershed: "#EF553B",
    CNN: "#3A3A3A"
}

function Boxplot(props) {
    const ids = props.ids || []

    let data = [
        {
            y: props.roqs,
            type: "box",
            name: "ROQS",
            marker: { color: COLORS.ROQS },
            boxpoints: 'all',
            jitter: 0.3,
            pointpos: 0,
            text: ids,
            hovertemplate: '<b>%{text}</b><br>Value: %{y:.6f}<extra>ROQS</extra>'
        },
        {
            y: props.watershed,
            type: "box",
            name: "Watershed",
            marker: { color: COLORS.Watershed },
            boxpoints: 'all',
            jitter: 0.3,
            pointpos: 0,
            text: ids,
            hovertemplate: '<b>%{text}</b><br>Value: %{y:.6f}<extra>Watershed</extra>'
        }
    ]

    if (props.cnn) {
        data.push({
            y: props.cnn,
            type: "box",
            name: "CNN",
            marker: { color: COLORS.CNN },
            boxpoints: 'all',
            jitter: 0.3,
            pointpos: 0,
            text: ids,
            hovertemplate: '<b>%{text}</b><br>Value: %{y:.6f}<extra>CNN</extra>'
        })
    }

    const PT = plotTheme()
    let layout = {
        title:  { text: props.title, font: { size: 13, color: PT.font } },
        height: 320,
        autosize: true,
        margin: { t: 36, b: 36, l: 44, r: 10 },
        legend: { orientation: 'h', y: -0.18 },
        plot_bgcolor: PT.plot,
        paper_bgcolor: PT.paper,
        font: { color: PT.font },
        yaxis: {
            gridcolor: PT.grid,
            zerolinecolor: PT.grid,
            ...(props.yRange ? { range: props.yRange } : {}),
            ...(props.yRange ? { title: { text: 'normalized [0–1]', font: { size: 9, color: '#aaa' } } } : {}),
        },
        xaxis: { showgrid: false },
    }

    return (
        <Plot
            data={data}
            layout={layout}
            config={{
                responsive: true,
                displayModeBar: 'hover',
                modeBarButtons: [['toImage']],
                toImageButtonOptions: { format: 'png', scale: 2, filename: `boxplot_${props.title || 'chart'}` },
            }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

export default Boxplot
