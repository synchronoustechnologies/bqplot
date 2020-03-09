import * as d3 from 'd3';
import * as _ from 'underscore';
import { MarkModel } from './MarkModel';
import * as serialize from './serialize';
import * as utils from './utils';

export class GanttModel extends MarkModel {
    defaults() {
        return {
            ...MarkModel.prototype.defaults(),
            _model_name: "GanttModel",
            _view_name: "Gantt",
            x: [],
            y: [],
            color: null,
            scales_metadata: {
                x: { orientation: "horizontal", dimension: "x" },
                y: { orientation: "vertical", dimension: "y" },
                color: { dimension: "color" }
            },
            colors: d3.scaleOrdinal(d3.schemeCategory10).range(),
            fill_colors: d3.scaleOrdinal(d3.schemeCategory10).range(),
            stroke_width: 2.0,
            labels_visibility: "none",
            curves_subset: [],
            line_style: "solid",
            interpolation: "linear",
            close_path: false,
            fill: "none",
            marker: null,
            marker_size: 64,
            opacities: [],
            fill_opacities: [],
            // Scatter options
            enable_move: false
        };
    }

    initialize(attributes, options) {
        super.initialize(attributes, options);
        this.on_some_change(["x", "y", "color"], this.update_data, this);
        this.on("change:labels", this.update_labels, this);
        // FIXME: replace this with on("change:preserve_domain"). It is not done here because
        // on_some_change depends on the GLOBAL backbone on("change") handler which
        // is called AFTER the specific handlers on("change:foobar") and we make that
        // assumption.
        this.on_some_change(["preserve_domain"], this.update_domains, this);
        this.update_data();
        this.update_domains();
    }

    update_data() {
        this.dirty = true;
        // Handling data updates
        const that = this;
        this.x_data = this.get("x");
        this.y_data = this.get("y");
        this.color_data = this.get("color") || [];

        let curve_labels = this.get("labels");
        if (this.x_data.length === 0 || this.y_data.length === 0) {
            this.mark_data = [];
        } else {
            this.x_data = utils.is_array(this.x_data[0]) ?
                this.x_data : [this.x_data];
            this.y_data = utils.is_array(this.y_data[0]) ?
                this.y_data : [this.y_data];
            curve_labels = this.get_labels();

            const y_length = this.y_data.length;

            if (this.x_data.length == 1 && y_length > 1) {
                // same x for all y
                this.mark_data = curve_labels.map(function(name, i) {
                    return {
                        name: name,
                        // since y_data may be a TypedArray, explicitly use Array.map
                        values: Array.prototype.map.call(that.y_data[i], function(d, j) {
                            return {x: that.x_data[0][j], y: d,
                                    y0: that.y_data[Math.min(i + 1, y_length - 1)][j],
                                    sub_index: j};
                        }),
                        color: that.color_data[i],
                        index: i,
                    };
                });
            } else {
                this.mark_data = curve_labels.map(function(name, i) {
                    const xy_data = d3.zip(that.x_data[i], that.y_data[i]);
                    return {
                        name: name,
                        values: xy_data.map(function(d, j) {
                            return {x: d[0], y: d[1],
                                    y0: that.y_data[Math.min(i + 1, y_length - 1)][j],
                                    sub_index: j};
                        }),
                        color: that.color_data[i],
                        index: i,
                    };
                });
            }
        }
        this.update_domains();
        this.dirty = false;
        this.trigger("data_updated");
    }

    update_labels() {
        // update the names in mark_data
        const labels = this.get_labels();
        this.mark_data.forEach(function(element, i) {
            element.name = labels[i];
        });
        this.trigger("labels_updated");
    }

    get_labels() {
        // Function to set the labels appropriately.
        // Setting the labels to the value sent and filling in the
        // remaining values.
        let curve_labels = this.get("labels");
        const data_length = (this.x_data.length == 1) ?
            (this.y_data.length) : Math.min(this.x_data.length, this.y_data.length);
        if(curve_labels.length > data_length) {
            curve_labels = curve_labels.slice(0, data_length);
        }
        else if(curve_labels.length < data_length) {
            _.range(curve_labels.length, data_length).forEach(function(index) {
                curve_labels[index] = "C" + (index+1);
            });
        }
        return curve_labels;
    }

    update_domains() {
        if(!this.mark_data) {
            return;
        }
        const scales = this.get("scales");
        const x_scale = scales.x, y_scale = scales.y;
        const color_scale = scales.color;

        if(!this.get("preserve_domain").x) {
            x_scale.compute_and_set_domain(this.mark_data.map(function(elem) {
                return elem.values.map(function(d) { return d.x; });
            }), this.model_id + "_x");
        } else {
            x_scale.del_domain([], this.model_id + "_x");
        }

        if(!this.get("preserve_domain").y) {
            y_scale.compute_and_set_domain(this.mark_data.map(function(elem) {
                return elem.values.map(function(d) { return d.y; });
            }), this.model_id + "_y");
        } else {
            y_scale.del_domain([], this.model_id + "_y");
        }
        if(color_scale !== null && color_scale !== undefined) {
            if(!this.get("preserve_domain").color) {
                color_scale.compute_and_set_domain(this.mark_data.map(function(elem) {
                    return elem.color;
                }), this.model_id + "_color");
            } else {
                color_scale.del_domain([], this.model_id + "_color");
            }
        }
    }

    get_data_dict(data, index) {
        return data;
    }

    static serializers = {
        ...MarkModel.serializers,
        x: serialize.array_or_json,
        y: serialize.array_or_json,
        color: serialize.array_or_json
    };

    x_data: any;
    y_data: any;
    color_data: any;
}
